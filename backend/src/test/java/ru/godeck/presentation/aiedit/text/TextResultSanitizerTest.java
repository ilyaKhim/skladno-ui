package ru.godeck.presentation.aiedit.text;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.aiedit.action.builtin.RephraseAction;
import ru.godeck.presentation.aiedit.action.builtin.ShortenAction;
import ru.godeck.presentation.aiedit.core.AiEditTarget;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;

import java.util.List;
import java.util.UUID;

class TextResultSanitizerTest {
    private final TextResultSanitizer sanitizer = new TextResultSanitizer();
    private final ResolvedTextTarget field =
            new ResolvedTextTarget(
                    UUID.randomUUID(),
                    "atlas",
                    new AiEditTarget.TemplateFieldTarget(3, "STATEMENT"),
                    46,
                    146,
                    146,
                    null,
                    null,
                    null);

    @Test
    void removesFramingQuotesAndMarkdown() {
        var result =
                sanitize(
                        List.of("«Коротко и ясно»", "\"Второй\"", "**Жирный** текст", "## Заголовок"),
                        "Исходный текст");
        assertThat(texts(result)).containsExactly("Коротко и ясно", "Второй", "Жирный текст", "Заголовок");
    }

    @Test
    void keepsQuotesThatAreNotFraming() {
        assertThat(texts(sanitize(List.of("«Альфа» и «Бета»"), "Исходник")))
                .containsExactly("«Альфа» и «Бета»");
    }

    @Test
    void replacesLineBreaksOnlyWhenTheSourceHadNone() {
        var flattened = sanitize(List.of("Первая строка\nвторая"), "Одна строка");
        assertThat(flattened.variants().getFirst().text()).isEqualTo("Первая строка вторая");
        assertThat(flattened.variants().getFirst().warnings()).containsExactly("line_breaks_removed");
        var kept = sanitize(List.of("Первая\nвторая"), "Было\nдве строки");
        assertThat(kept.variants().getFirst().text()).isEqualTo("Первая\nвторая");
        assertThat(kept.variants().getFirst().warnings()).isEmpty();
    }

    @Test
    void removesTemplateMarkersButKeepsPlaceholders() {
        assertThat(texts(sanitize(List.of("{{TITLE}} для [Компания]"), "Текст")))
                .containsExactly("TITLE для [Компания]");
        assertThat(texts(sanitize(List.of("{{{{x}}}}"), "Текст"))).containsExactly("x");
    }

    @Test
    void overLimitIsReportedAndNeverTruncated() {
        String long_ = "Мы готовим презентации оперативно и без лишних затрат усилий";
        var view = sanitize(List.of(long_), "Мы делаем презентации быстро").variants().getFirst();
        assertThat(view.text()).isEqualTo(long_);
        assertThat(view.length()).isEqualTo(60);
        assertThat(view.overBy()).isEqualTo(14);
        assertThat(view.warnings()).containsExactly("over_limit");
    }

    @Test
    void exceedsHardLimitIsReportedAndNeverTruncated() {
        String huge = "а".repeat(500);
        var view = sanitize(List.of(huge), "Текст").variants().getFirst();
        assertThat(view.text()).isEqualTo(huge);
        assertThat(view.length()).isEqualTo(500);
        assertThat(view.overBy()).isEqualTo(454);
        assertThat(view.warnings()).containsExactly("over_limit", "exceeds_hard_limit");
    }

    @Test
    void shortenWarnsWhenTheResultIsNotShorter() {
        var result =
                sanitizer.sanitize(
                        List.of("Совсем не короче исходного", "Коротко"),
                        "Не короче исходного",
                        field,
                        new ShortenAction());
        assertThat(result.variants().get(0).warnings()).containsExactly("not_shorter");
        assertThat(result.variants().get(1).warnings()).isEmpty();
    }

    @Test
    void dropsEmptyAndDuplicateVariants() {
        assertThat(texts(sanitize(List.of("  ", "Один", "«Один»", "**", "Два"), "Источник")))
                .containsExactly("Один", "Два");
    }

    @Test
    void variantsEqualToTheSourceAreUnchanged() {
        var result = sanitize(List.of("Тот же текст", " «Тот же текст» "), "Тот же текст");
        assertThat(result.changed()).isFalse();
        assertThat(result.variants()).isEmpty();
        assertThat(sanitize(List.of("", "  "), "Текст").changed()).isFalse();
    }

    private TextResultSanitizer.Result sanitize(List<String> variants, String source) {
        return sanitizer.sanitize(variants, source, field, new RephraseAction());
    }

    private static List<String> texts(TextResultSanitizer.Result result) {
        return result.variants().stream().map(v -> v.text()).toList();
    }
}
