package ru.godeck.presentation.aiedit.text;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.dto.TextVariantView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Deterministic clean-up of model variants, without another model call.
 *
 * <p>Removes framing quotes and markdown, replaces line breaks the source did not have, removes
 * template markers, drops empty and duplicate variants, and reports length warnings. Text is
 * <strong>never truncated</strong>: a variant longer than the limit is returned in full with {@code
 * over_limit}, and one longer than the hard limit with {@code exceeds_hard_limit}.
 */
@Component
public class TextResultSanitizer {
    public static final String OVER_LIMIT = "over_limit";
    public static final String EXCEEDS_HARD_LIMIT = "exceeds_hard_limit";
    public static final String LINE_BREAKS_REMOVED = "line_breaks_removed";
    private static final String[][] QUOTES = {
        {"«", "»"}, {"\"", "\""}, {"“", "”"}, {"„", "“"}, {"”", "”"}
    };
    private static final Pattern LINE_BREAK = Pattern.compile("\\s*\\R\\s*");
    private static final Pattern HEADING = Pattern.compile("(?m)^[ \\t]*#+[ \\t]*");
    private static final String BOLD = "**";
    private static final String UNDERLINE_BOLD = "__";
    private static final String MARKER_OPEN = "{{";
    private static final String MARKER_CLOSE = "}}";

    /**
     * Cleans raw variants of one answer.
     *
     * @return unique non-empty variants; {@code unchanged} when none remains or every variant
     *     equals the source
     */
    public Result sanitize(
            List<String> variants,
            String source,
            ResolvedTextTarget target,
            TextEditAction action) {
        boolean sourceHasBreaks = source.contains("\n") || source.contains("\r");
        var texts = new LinkedHashSet<String>();
        var removedBreaks = new java.util.HashSet<String>();
        for (String raw : variants) {
            if (raw == null) continue;
            String text = stripFormatting(raw);
            boolean breaksRemoved = !sourceHasBreaks && LINE_BREAK.matcher(text).find();
            if (breaksRemoved) text = LINE_BREAK.matcher(text).replaceAll(" ");
            text = removeMarkers(text).strip();
            if (text.isEmpty()) continue;
            if (texts.add(text) && breaksRemoved) removedBreaks.add(text);
        }
        boolean unchanged =
                texts.stream().allMatch(text -> text.equals(source) || text.equals(source.strip()));
        if (unchanged) return new Result(false, List.of());
        List<TextVariantView> views = new ArrayList<>();
        for (String text : texts) {
            List<String> warnings = new ArrayList<>();
            int length = text.length();
            if (length > target.maxChars()) warnings.add(OVER_LIMIT);
            if (length > target.hardMaxChars()) warnings.add(EXCEEDS_HARD_LIMIT);
            warnings.addAll(action.warnings(source, text, target));
            if (removedBreaks.contains(text)) warnings.add(LINE_BREAKS_REMOVED);
            views.add(
                    new TextVariantView(
                            text,
                            length,
                            Math.max(0, length - target.maxChars()),
                            List.copyOf(warnings)));
        }
        return new Result(true, List.copyOf(views));
    }

    /** Trims, removes framing quotes and markdown emphasis/headings. */
    static String stripFormatting(String raw) {
        String text = raw.strip();
        text = text.replace(BOLD, "").replace(UNDERLINE_BOLD, "");
        text = HEADING.matcher(text).replaceAll("").strip();
        boolean changed = true;
        while (changed && text.length() >= 2) {
            changed = false;
            for (String[] pair : QUOTES) {
                if (text.startsWith(pair[0]) && text.endsWith(pair[1])) {
                    String inner = text.substring(pair[0].length(), text.length() - pair[1].length());
                    // «А» и «Б» is not framed: the inner text still contains the quote marks.
                    if (inner.contains(pair[0]) || inner.contains(pair[1])) continue;
                    text = inner.strip();
                    changed = true;
                    break;
                }
            }
        }
        return text;
    }

    /** Template markers are rejected by the editor validator, so they never reach a variant. */
    static String removeMarkers(String text) {
        String result = text;
        while (result.contains(MARKER_OPEN) || result.contains(MARKER_CLOSE))
            result = result.replace(MARKER_OPEN, "").replace(MARKER_CLOSE, "");
        return result;
    }

    /**
     * @param changed {@code false} means status {@code unchanged} with no variants
     */
    public record Result(boolean changed, List<TextVariantView> variants) {}
}
