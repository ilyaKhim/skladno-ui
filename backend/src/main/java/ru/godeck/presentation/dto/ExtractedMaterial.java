package ru.godeck.presentation.dto;

import java.util.List;

/** Stateless extraction result shown before any paid generation; page numbers are one-based. */
public record ExtractedMaterial(
        String format,
        String name,
        String text,
        int characters,
        Integer pages,
        List<Warning> warnings) {
    public record Warning(String code, String message, List<Integer> pages) {}
}
