package ru.godeck.presentation.aiedit.text;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ru.godeck.presentation.aiedit.core.AlternativeReason;

import java.util.List;

class AlternativeReplyTest {
    @ParameterizedTest
    @EnumSource(AlternativeReason.class)
    void emptyAnswerGetsTheTextsOfItsReason(AlternativeReason reason) {
        var reply = AlternativeReply.of(reason, "  ", List.of(" ", ""));
        assertThat(reply.message()).isNotBlank();
        assertThat(reply.suggestions()).isNotEmpty().hasSizeLessThanOrEqualTo(3);
        assertThat(reply.suggestions()).allSatisfy(text -> assertThat(text).hasSizeLessThanOrEqualTo(80));
    }

    @Test
    void stylePanelFallbackDoesNotRepeatTheHintOfTheChat() {
        var reply = AlternativeReply.standard(AlternativeReason.STYLE_PANEL);
        assertThat(reply.message()).doesNotContain("панели", "Шрифт");
    }

    @Test
    void needsSourceOffersThePlaceholderAndARetelling() {
        assertThat(AlternativeReply.standard(AlternativeReason.NEEDS_SOURCE).suggestions())
                .containsExactly("Вставь заглушку [Цитата: имя, источник]", "Перескажи мысль своими словами без цитаты");
    }

    @Test
    void modelTextsAreKept() {
        var reply = AlternativeReply.of(AlternativeReason.ADVICE, " Совет ", List.of(" Сократи "));
        assertThat(reply.message()).isEqualTo("Совет");
        assertThat(reply.suggestions()).containsExactly("Сократи");
    }

    @Test
    void messageWithoutSuggestionsIsAllowed() {
        var reply = AlternativeReply.of(AlternativeReason.ADVICE, "Всё хорошо", List.of());
        assertThat(reply.suggestions()).isEmpty();
    }

    @Test
    void suggestionsWithoutAMessageGetAMessage() {
        var reply = AlternativeReply.of(AlternativeReason.CLARIFY, "", List.of("Сократи"));
        assertThat(reply.message()).isNotBlank();
        assertThat(reply.suggestions()).containsExactly("Сократи");
    }

    @Test
    void unusableSuggestionsAreDroppedBeforeTheLimit() {
        var reply =
                AlternativeReply.of(
                        AlternativeReason.ADVICE,
                        "Совет",
                        List.of(
                                "а".repeat(81),
                                "про {{TITLE}}",
                                "скобки }}",
                                "",
                                "Первая",
                                "Первая",
                                "б".repeat(80),
                                "Третья",
                                "Четвёртая"));
        assertThat(reply.suggestions()).containsExactly("Первая", "б".repeat(80), "Третья");
    }
}
