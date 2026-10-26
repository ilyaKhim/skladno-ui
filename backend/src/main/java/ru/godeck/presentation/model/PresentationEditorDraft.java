package ru.godeck.presentation.model;

import java.util.Map;

/**
 * Persisted staging state of the visual editor.
 *
 * <p>The draft intentionally keeps {@link PresentationContent} as its body instead of storing a
 * browser-specific scene graph. The visual editor, AI editing, validation, and PowerPoint renderer
 * therefore converge on one semantic model, while editor-only names remain harmless metadata.
 *
 * @param title user-facing deck title shown by the editor
 * @param slideNames editor labels keyed by original template slide number
 * @param content semantic fields, slide order, visibility, custom blocks, images, and layout
 *     overrides
 */
public record PresentationEditorDraft(
        String title, Map<Integer, String> slideNames, PresentationContent content) {}
