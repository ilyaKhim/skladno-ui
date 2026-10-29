package ru.godeck.presentation.material;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.mapper.GenerationInputCodec;
import ru.godeck.presentation.model.GenerationInput;
import ru.godeck.presentation.model.SourceMaterial;

import tools.jackson.databind.ObjectMapper;

class GenerationInputTest {
    @Test
    void legacyInputIsNullAndSnapshotRoundTrips() {
        assertThat(GenerationInput.normalize(null, " ", null)).isNull();
        var input =
                GenerationInput.normalize(
                        " Цель ",
                        " Команда ",
                        new SourceMaterial(
                                "DOCX", "C:\\reports\\Отчёт.docx", "\uFEFF Факт\r\nИтог "));
        assertThat(input.goal()).isEqualTo("Цель");
        assertThat(input.source().name()).isEqualTo("Отчёт.docx");
        assertThat(input.source().text()).isEqualTo("Факт\nИтог");
        var codec = new GenerationInputCodec(new ObjectMapper());
        assertThat(codec.decode(codec.encode(input))).isEqualTo(input);
        assertThat(codec.decode(null)).isNull();
    }

    @Test
    void editedPreviewsAndContextAreValidatedAgain() {
        assertThatThrownBy(
                        () ->
                                GenerationInput.normalize(
                                        null, null, new SourceMaterial("xlsx", "x.xlsx", "text")))
                .extracting(
                        error ->
                                ((ru.godeck.presentation.exception.GenerationException) error)
                                        .code())
                .isEqualTo("unsupported_source");
        assertThatThrownBy(
                        () ->
                                GenerationInput.normalize(
                                        null,
                                        null,
                                        new SourceMaterial("txt", "x.txt", "a".repeat(30_001))))
                .extracting(
                        error ->
                                ((ru.godeck.presentation.exception.GenerationException) error)
                                        .code())
                .isEqualTo("source_too_long");
        assertThatThrownBy(() -> GenerationInput.normalize("g".repeat(501), null, null))
                .extracting(
                        error ->
                                ((ru.godeck.presentation.exception.GenerationException) error)
                                        .code())
                .isEqualTo("invalid_input");
        assertThatThrownBy(
                        () ->
                                GenerationInput.normalize(
                                        null, null, new SourceMaterial("txt", "../", "text")))
                .extracting(
                        error ->
                                ((ru.godeck.presentation.exception.GenerationException) error)
                                        .code())
                .isEqualTo("source_invalid");
    }
}
