package ru.godeck.presentation.aiedit.text;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.core.FactGuardLevel;
import ru.godeck.presentation.aiedit.dto.TextVariantView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Code check of invented facts: the prompt asks the model not to invent them, this does not ask.
 *
 * <p>A new number with a percent, currency or magnitude and a new quotation of three or more words
 * block the text; another new number of two or more digits, or the flag of the model, adds the
 * {@code check_facts} warning. "New" means absent from the known texts. Text is never changed.
 *
 * <p>The check is deliberately simple and errs in both directions: a joke with a quoted line is
 * blocked, while an invented quote without quotation marks and numbers written in words pass. A
 * false block is safer than invention, and the {@code fact_guard} metric shows how often it happens.
 * Nothing here depends on what kind of target the text belongs to.
 */
@Component
public class FactGuard {
    public static final String CHECK_FACTS = "check_facts";
    private static final int MIN_QUOTE_WORDS = 3;
    private static final int MIN_FLAGGED_DIGITS = 2;
    private static final int MAX_PLACEHOLDER_WORDS = 4;
    private static final int MAX_PLACEHOLDER_CHARS = 40;
    private static final int UNICODE =
            Pattern.UNICODE_CHARACTER_CLASS | Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final String SPACE = "\\s\\u202F\\u2009";
    private static final String GROUP_SEPARATOR = ".,'’" + SPACE;
    private static final String NUMBER_TEXT =
            "(?:\\d{1,3}(?:[" + GROUP_SEPARATOR + "]\\d{3})+(?!\\d)|\\d+)(?:[.,]\\d+)?";
    private static final String NOT_INSIDE_NUMBER = "(?<!\\d)(?<!\\d[.,'’])";
    private static final String UNIT_TEXT =
            "%|₽|\\$|€|руб(?:л\\p{L}{0,3}|\\.)?|доллар\\p{L}{0,3}|долл\\.?|dollars?|usd"
                    + "|евро|euros?|eur|процент\\p{L}{0,3}|percent"
                    + "|млн\\.?|миллион\\p{L}{0,3}|million|млрд\\.?|миллиард\\p{L}{0,3}|billion"
                    + "|тыс(?:яч\\p{L}{0,2}|\\.)?|thousand";
    private static final Pattern NUMBER = Pattern.compile(NOT_INSIDE_NUMBER + NUMBER_TEXT, UNICODE);
    private static final Pattern GROUPED_NUMBER = Pattern.compile("\\d{1,3}(?:[.,]\\d{3})+");
    private static final Pattern AMOUNT =
            Pattern.compile(
                    NOT_INSIDE_NUMBER
                            + "("
                            + NUMBER_TEXT
                            + ")["
                            + SPACE
                            + "]*("
                            + UNIT_TEXT
                            + ")(?![\\p{L}\\p{N}])|([$€₽])["
                            + SPACE
                            + "]*("
                            + NUMBER_TEXT
                            + ")",
                    UNICODE);
    private static final String DOUBLE_QUOTES = "«»\"“”„‟＂〝〞";
    private static final String SINGLE_QUOTES = "‘‚‛‹›";

    /** Any pair of double quotes, even mixed; a single quote must not be an apostrophe in a word. */
    private static final Pattern QUOTE =
            Pattern.compile(
                    "["
                            + DOUBLE_QUOTES
                            + "]([^"
                            + DOUBLE_QUOTES
                            + "]+)["
                            + DOUBLE_QUOTES
                            + "]|(?<![\\p{L}\\p{N}])['‘‚‛‹]([^\\n"
                            + SINGLE_QUOTES
                            + "]+?)['’‘›](?![\\p{L}\\p{N}])",
                    UNICODE);

    /** A placeholder names what is missing; one with a number or quotation states a fact itself. */
    private static final Pattern PLACEHOLDER =
            Pattern.compile("\\[([^\\[\\]\\d" + DOUBLE_QUOTES + SINGLE_QUOTES + "]*)\\]", UNICODE);

    private static final Pattern WHITESPACE = Pattern.compile("[" + SPACE + "]+", UNICODE);

    /**
     * Facts the text may repeat.
     *
     * @param text all known texts, normalized
     * @param numbers every known number, with or without a unit
     * @param amounts known numbers with their unit
     */
    public record Known(String text, Set<String> numbers, Set<String> amounts) {}

    /**
     * @param variants variants that may be shown, with their warnings
     * @param level strongest action taken on any variant
     */
    public record Review(List<TextVariantView> variants, FactGuardLevel level) {}

    /** Collects known facts; absent ({@code null}) texts are skipped. */
    public Known known(List<String> texts) {
        String joined = texts.stream().filter(Objects::nonNull).collect(Collectors.joining("\n"));
        Set<String> numbers = new HashSet<>();
        NUMBER.matcher(joined).results().forEach(match -> numbers.add(number(match.group())));
        Set<String> amounts = new HashSet<>();
        Matcher amount = AMOUNT.matcher(joined);
        while (amount.find()) amounts.add(amount(amount));
        return new Known(normalized(joined), Set.copyOf(numbers), Set.copyOf(amounts));
    }

    /**
     * Checks one text.
     *
     * @param flaggedByModel the model reported a well-known fact in this text
     */
    public FactGuardLevel check(String text, Known known, boolean flaggedByModel) {
        if (hasNewLongPlaceholder(text, known)) return FactGuardLevel.BLOCKED;
        String checked = PLACEHOLDER.matcher(text).replaceAll(" ");
        if (hasNewQuote(checked, known)) return FactGuardLevel.BLOCKED;
        Matcher amount = AMOUNT.matcher(checked);
        while (amount.find())
            if (!known.amounts().contains(amount(amount))) return FactGuardLevel.BLOCKED;
        boolean newNumber =
                NUMBER.matcher(AMOUNT.matcher(checked).replaceAll(" ")).results()
                        .map(match -> number(match.group()))
                        .anyMatch(
                                number ->
                                        digits(number) >= MIN_FLAGGED_DIGITS
                                                && !known.numbers().contains(number));
        return newNumber || flaggedByModel ? FactGuardLevel.FLAGGED : FactGuardLevel.NONE;
    }

    /**
     * Drops blocked variants and marks flagged ones; texts themselves stay as they are.
     *
     * @param flaggedByModel texts of the variants the model flagged
     * @param blockedBeforeCleaning texts whose raw form was blocked: the sanitizer removes framing
     *     quotes, so a variant that was a whole quotation no longer looks like one
     */
    public Review review(
            List<TextVariantView> variants,
            Known known,
            Set<String> flaggedByModel,
            Set<String> blockedBeforeCleaning) {
        FactGuardLevel strongest = FactGuardLevel.NONE;
        List<TextVariantView> kept = new ArrayList<>();
        for (TextVariantView variant : variants) {
            FactGuardLevel level =
                    blockedBeforeCleaning.contains(variant.text())
                            ? FactGuardLevel.BLOCKED
                            : check(variant.text(), known, flaggedByModel.contains(variant.text()));
            strongest = strongest.strongest(level);
            if (level == FactGuardLevel.BLOCKED) continue;
            kept.add(level == FactGuardLevel.FLAGGED ? flagged(variant) : variant);
        }
        return new Review(List.copyOf(kept), strongest);
    }

    private static TextVariantView flagged(TextVariantView variant) {
        List<String> warnings = new ArrayList<>(variant.warnings());
        warnings.add(CHECK_FACTS);
        return new TextVariantView(
                variant.text(), variant.length(), variant.overBy(), List.copyOf(warnings));
    }

    /** Text in brackets too long to name a gap is content: a quotation cannot hide there. */
    private static boolean hasNewLongPlaceholder(String text, Known known) {
        Matcher placeholder = PLACEHOLDER.matcher(text);
        while (placeholder.find()) {
            String content = placeholder.group(1);
            boolean tooLong =
                    content.length() > MAX_PLACEHOLDER_CHARS || words(content) > MAX_PLACEHOLDER_WORDS;
            if (tooLong && !known.text().contains(normalized(content))) return true;
        }
        return false;
    }

    private static boolean hasNewQuote(String text, Known known) {
        Matcher quote = QUOTE.matcher(text);
        while (quote.find()) {
            String fragment = firstGroup(quote);
            if (words(fragment) >= MIN_QUOTE_WORDS && !known.text().contains(normalized(fragment)))
                return true;
        }
        return false;
    }

    private static String firstGroup(Matcher match) {
        for (int group = 1; group <= match.groupCount(); group++)
            if (match.group(group) != null) return match.group(group);
        return "";
    }

    private static long words(String fragment) {
        return WHITESPACE.splitAsStream(fragment)
                .filter(word -> word.codePoints().anyMatch(Character::isLetterOrDigit))
                .count();
    }

    /** Number and canonical unit, so that {@code 37%} equals {@code 37 процентов}. */
    private static String amount(Matcher match) {
        return match.group(1) != null
                ? number(match.group(1)) + unit(match.group(2))
                : number(match.group(4)) + unit(match.group(3));
    }

    private static String unit(String unit) {
        String text = unit.toLowerCase(Locale.ROOT);
        if (text.equals("%") || text.startsWith("процент") || text.startsWith("percent")) return "%";
        if (text.equals("₽") || text.startsWith("руб")) return "rub";
        if (text.equals("$") || text.startsWith("долл") || text.startsWith("dollar") || text.equals("usd"))
            return "usd";
        if (text.equals("€") || text.startsWith("евро") || text.startsWith("eur")) return "eur";
        if (text.startsWith("млрд") || text.startsWith("миллиард") || text.startsWith("billion"))
            return "bln";
        if (text.startsWith("млн") || text.startsWith("миллион") || text.startsWith("million"))
            return "mln";
        return "thousand";
    }

    /** One spelling of a value: {@code 1 000,5}, {@code 1.000,5} and {@code 1,000.5} are equal. */
    private static String number(String number) {
        var ascii = new StringBuilder();
        number.codePoints()
                .forEach(
                        point -> {
                            if (Character.isDigit(point)) ascii.append(Character.digit(point, 10));
                            else if (point == ',' || point == '.') ascii.append('.');
                        });
        String text = ascii.toString();
        if (GROUPED_NUMBER.matcher(text).matches()) return text.replace(".", "");
        int decimal = text.lastIndexOf('.');
        return decimal < 0 ? text : text.substring(0, decimal).replace(".", "") + text.substring(decimal);
    }

    private static long digits(String number) {
        return number.chars().filter(Character::isDigit).count();
    }

    private static String normalized(String text) {
        return WHITESPACE.matcher(text.toLowerCase(Locale.ROOT)).replaceAll(" ").strip();
    }
}
