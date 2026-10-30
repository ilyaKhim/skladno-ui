package ru.godeck.presentation.model;

/**
 * User-reviewed source text; binary uploads are deliberately not retained in the generation job.
 */
public record SourceMaterial(String format, String name, String text) {}
