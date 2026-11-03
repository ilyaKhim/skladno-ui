package ru.godeck.presentation.aiedit.text;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.aiedit.core.FactGuardLevel;
import ru.godeck.presentation.aiedit.dto.TextVariantView;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

class FactGuardTest {
    private final FactGuard guard = new FactGuard();
    private final FactGuard.Known nothing = guard.known(List.of("Мы делаем презентации быстро"));

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Рост составил 37 %",
                "Рост составил 37%",
                "Рост составил 37,5%",
                "Рост 3 %",
                "Рост 37 процентов",
                "Цена 500 ₽",
                "Цена 500 руб.",
                "Цена 500 рублей",
                "Цена 1 200 ₽",
                "Цена $500",
                "Цена 500 $",
                "Цена € 500",
                "Цена 500 евро",
                "Цена 500 долларов",
                "Выручка 5 млн",
                "Выручка 5 млрд",
                "Выручка 5 миллионов",
                "Клиентов 20 тыс.",
                "Клиентов 20 тысяч"
            })
    void newNumberWithAUnitIsBlocked(String text) {
        assertThat(guard.check(text, nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Цена 1,000,000 руб",
                "Цена 1.000.000 ₽",
                "Цена 12,500,000 рублей",
                "Цена 1'000'000 ₽",
                "Цена 1 000 000 ₽",
                "Цена 500 USD",
                "Цена 20 euros",
                "Цена 20 eur",
                "Рост 37 percent",
                "Цена 500 долл.",
                "Рынок 5 million dollars",
                "Рынок 5 billion",
                "Рынок 5 thousand",
                "Цена 20 руб",
                "Год.37%",
                "Рост,37%",
                "３７%"
            })
    void reviewFindingsOfNumberFormatsAreBlocked(String text) {
        assertThat(guard.check(text, nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void numberFormatsOfOneValueAreTheSameFact() {
        var known = guard.known(List.of("Цена 1 000 000 ₽, рост 1,5 %, 500 USD"));
        assertThat(guard.check("Цена 1,000,000 рублей, рост 1.5 процентов, $500", known, false))
                .isEqualTo(FactGuardLevel.NONE);
        assertThat(guard.check("Цена １０００００ ₽", guard.known(List.of("Цена 100000 ₽")), false))
                .isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void wordNumbersAreAKnownLimitation() {
        assertThat(guard.check("Рост тридцать семь процентов", nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Он сказал: \"двигатель останется основой марки”",
                "Он сказал: «двигатель останется основой марки”",
                "Он сказал: “двигатель останется основой марки\"",
                "Он сказал: ‘двигатель останется основой марки’",
                "Он сказал: ‹двигатель останется основой марки›",
                "Он сказал: ‚двигатель останется основой марки’",
                "Он сказал: 'двигатель останется основой марки'",
                "Он сказал: ‟двигатель останется основой марки”",
                "Он сказал: ＂двигатель останется основой марки＂"
            })
    void everyKindOfQuoteAndMixedPairsAreQuotes(String text) {
        assertThat(guard.check(text, nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void apostrophesAreNotQuotes() {
        assertThat(guard.check("Д’Артаньян и it’s a good day for don’t", nothing, false))
                .isEqualTo(FactGuardLevel.NONE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"[Цитата: имя, источник]", "[число]", "[Цена]", "[Телефон]", "[Сайт]", "[Email]", "[Ваше имя]", "[должность]", "[должность, компания]"})
    void realPlaceholdersOfTemplatesPass(String placeholder) {
        assertThat(guard.check("Контакт " + placeholder, nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void longTextInBracketsIsNotAPlaceholder() {
        assertThat(guard.check("[Цитата: Мы строим лучшие двигатели в мире и никогда не остановимся]", nothing, false))
                .isEqualTo(FactGuardLevel.BLOCKED);
        String known = "[Цитата: мы строим лучшие двигатели в мире и никогда не остановимся]";
        assertThat(guard.check(known, guard.known(List.of(known)), false)).isEqualTo(FactGuardLevel.NONE);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Заходит презентация в бар, а бармен говорит: сократись. Она и сократилась до трёх слайдов.",
                "Менеджер спросил дизайнера: сколько слайдов? Тот ответил: сколько выдержит проектор.",
                "Встретились два слайда. Один другому: ты чего такой пустой? А тот: я заглушка.",
                "Оппозитный двигатель так хорош, что инженеры спорят с ним только по праздникам.",
                "Год прошёл. Команда выросла. Клиенты довольны.",
                "Версия 2.0 вышла, 3 шага до цели, план на 12.10.",
                "Шаг 1. Цель 2. Итог 3.",
                "В 1998 году, в марте"
            })
    void ordinaryJokesAndProsePassWithoutABlock(String text) {
        assertThat(guard.check(text, nothing, false)).isNotEqualTo(FactGuardLevel.BLOCKED);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Он сказал: «двигатель останется основой марки»",
                "Он сказал: \"двигатель останется основой марки\"",
                "Он сказал: “двигатель останется основой марки”",
                "Он сказал: „двигатель останется основой марки“"
            })
    void newQuotationOfThreeWordsIsBlocked(String text) {
        assertThat(guard.check(text, nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void shortQuotationIsNotAQuote() {
        assertThat(guard.check("Компания «Рога и копыта»", nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
        assertThat(guard.check("Компания «Газпром нефть»", nothing, false)).isEqualTo(FactGuardLevel.NONE);
        assertThat(guard.check("Это «лучший» выбор — не шутка", nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void otherNewNumberOfTwoDigitsIsFlagged() {
        assertThat(guard.check("Основана в 1998 году", nothing, false)).isEqualTo(FactGuardLevel.FLAGGED);
        assertThat(guard.check("Работают 12 человек", nothing, false)).isEqualTo(FactGuardLevel.FLAGGED);
    }

    @Test
    void oneDigitIsNotAFact() {
        assertThat(guard.check("Есть 3 причины", nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void modelFlagIsFlagged() {
        assertThat(guard.check("Земля круглая", nothing, true)).isEqualTo(FactGuardLevel.FLAGGED);
    }

    @Test
    void blockIsStrongerThanTheModelFlag() {
        assertThat(guard.check("Рост 37 %", nothing, true)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void placeholdersAreNotFacts() {
        assertThat(guard.check("[Цитата: имя, источник]", nothing, false)).isEqualTo(FactGuardLevel.NONE);
        assertThat(guard.check("Рост: [процент] и «[Цитата: имя, источник]»", nothing, false))
                .isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void placeholderWithAFactIsNotAPlaceholder() {
        assertThat(guard.check("Рост [37 %]", nothing, false)).isEqualTo(FactGuardLevel.BLOCKED);
        assertThat(guard.check("[«двигатель останется основой марки»]", nothing, false))
                .isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void numberFromTheSourceIsKnown() {
        var known = guard.known(List.of("Рост 37 % и 1 200 ₽ в 2024 году"));
        assertThat(guard.check("В 2024 году рост 37%, цена 1200 рублей", known, false))
                .isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void numberFromTheRequestIsKnown() {
        var known = guard.known(Arrays.asList("Текст", "добавь рост 37 %", null, null, null));
        assertThat(guard.check("Рост 37 процентов", known, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void numbersOfTitlesAndRoleAreKnown() {
        var known = guard.known(Arrays.asList("Текст", null, "Роль на 15 слов", "Отчёт 2024", "Цена 99 ₽"));
        assertThat(guard.check("За 15 слов в 2024: 99 ₽", known, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void anotherCurrencyIsANewPrice() {
        var known = guard.known(List.of("Цена 500 ₽"));
        assertThat(guard.check("Цена 500 $", known, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void knownBareNumberDoesNotAllowAUnit() {
        var known = guard.known(List.of("У нас 37 сотрудников"));
        assertThat(guard.check("У нас 37 % сотрудников", known, false)).isEqualTo(FactGuardLevel.BLOCKED);
    }

    @Test
    void knownQuotationPasses() {
        var known = guard.known(List.of("Девиз: «Двигатель  останется основой марки»"));
        assertThat(guard.check("Девиз «двигатель останется основой марки»", known, false))
                .isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void jokeWithoutQuotationMarksPasses() {
        String joke = "Приходит презентация к дизайнеру, а тот занят. Пришлось сделать её самой.";
        assertThat(guard.check(joke, nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void wordsThatOnlyLookLikeUnitsAreNotAmounts() {
        assertThat(guard.check("Прошло 2 тысячелетия и 5 рубежей", nothing, false)).isEqualTo(FactGuardLevel.NONE);
    }

    @Test
    void reviewDropsBlockedVariantsMarksFlaggedAndNeverChangesText() {
        var plain = variant("Простой текст");
        var blocked = variant("Рост 37 %");
        var number = variant("Основана в 1998 году");
        var flagged = variant("Земля круглая");
        var review = guard.review(List.of(plain, blocked, number, flagged), nothing, Set.of(flagged.text()), Set.of());
        assertThat(review.level()).isEqualTo(FactGuardLevel.BLOCKED);
        assertThat(review.variants()).extracting(TextVariantView::text)
                .containsExactly(plain.text(), number.text(), flagged.text());
        assertThat(review.variants().get(0).warnings()).isEmpty();
        assertThat(review.variants().get(1).warnings()).containsExactly("check_facts");
        assertThat(review.variants().get(2).warnings()).containsExactly("check_facts");
    }

    @Test
    void reviewDropsWhatWasBlockedBeforeCleaning() {
        var cleaned = variant("Мы строим лучшие двигатели");
        var review = guard.review(List.of(cleaned), nothing, Set.of(), Set.of(cleaned.text()));
        assertThat(review.level()).isEqualTo(FactGuardLevel.BLOCKED);
        assertThat(review.variants()).isEmpty();
    }

    @Test
    void reviewKeepsEarlierWarnings() {
        var over = new TextVariantView("Основана в 1998 году", 20, 3, List.of("over_limit"));
        var review = guard.review(List.of(over), nothing, Set.of(), Set.of());
        assertThat(review.level()).isEqualTo(FactGuardLevel.FLAGGED);
        assertThat(review.variants().getFirst().warnings()).containsExactly("over_limit", "check_facts");
    }

    private static TextVariantView variant(String text) {
        return new TextVariantView(text, text.length(), 0, List.of());
    }
}
