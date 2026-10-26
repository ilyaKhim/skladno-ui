package ru.godeck.presentation.model;

import java.util.Map;

/** Persisted editor state. Content remains semantic so AI edits and PPTX rendering share one model. */
public record PresentationEditorDraft(
        String title, Map<Integer, String> slideNames, PresentationContent content) {}
