package ru.godeck.presentation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;
import java.util.Map;

public record PresentationContent(
        @NotNull Map<String, String> fields, @NotEmpty List<@Valid Slide> slides) {
    public record Slide(@Min(1) int slide, @NotNull Boolean include, @NotBlank String reason) {}

    public int slideCount() {
        return (int) slides.stream().filter(s -> Boolean.TRUE.equals(s.include())).count();
    }
}
