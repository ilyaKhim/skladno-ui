package ru.godeck.presentation.model;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.material.MaterialPolicy;

import java.util.Locale;
import java.util.Set;

/**
 * Immutable additional generation context, stored before queueing and never exposed in job lists.
 * The source is user-editable data, not an attestation that its text exactly matches an upload.
 */
public record GenerationInput(String goal, String audience, SourceMaterial source) {
    private static final Set<String> FORMATS = Set.of("pdf", "docx", "txt");

    /** Canonicalizes all new fields once so request hashing, persistence, and the prompt agree. */
    public static GenerationInput normalize(String goal, String audience, SourceMaterial source) {
        String normalizedGoal = context(goal);
        String normalizedAudience = context(audience);
        SourceMaterial normalizedSource = null;
        if (source != null) {
            String format = source.format() == null ? "" : source.format().toLowerCase(Locale.ROOT);
            if (!FORMATS.contains(format))
                throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
            normalizedSource =
                    new SourceMaterial(format, safeName(source.name()), sourceText(source.text()));
        }
        return normalizedGoal == null && normalizedAudience == null && normalizedSource == null
                ? null
                : new GenerationInput(normalizedGoal, normalizedAudience, normalizedSource);
    }

    /**
     * Validates even edited previews; exceeding the limit is never treated as permission to
     * truncate.
     */
    public static String sourceText(String text) {
        if (text == null) throw new GenerationException(GenerationError.SOURCE_EMPTY);
        String normalized = text.startsWith("\uFEFF") ? text.substring(1) : text;
        normalized = normalized.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (normalized.length() > MaterialPolicy.MAX_TEXT_CHARACTERS)
            throw new GenerationException(GenerationError.SOURCE_TOO_LONG);
        if (normalized.isBlank()) throw new GenerationException(GenerationError.SOURCE_EMPTY);
        if (normalized
                .codePoints()
                .anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t'))
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        return normalized;
    }

    /** Keeps only a display basename; user-supplied names never become filesystem paths. */
    public static String safeName(String name) {
        if (name == null || name.isBlank())
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        String normalized = name.replace('\\', '/');
        normalized = normalized.substring(normalized.lastIndexOf('/') + 1).strip();
        if (normalized.isBlank()
                || normalized.length() > MaterialPolicy.MAX_NAME_CHARACTERS
                || normalized.codePoints().anyMatch(Character::isISOControl))
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        return normalized;
    }

    private static String context(String text) {
        if (text == null || text.isBlank()) return null;
        String normalized = text.strip();
        if (normalized.length() > MaterialPolicy.MAX_CONTEXT_CHARACTERS
                || normalized
                        .codePoints()
                        .anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t'))
            throw new GenerationException(GenerationError.INVALID_INPUT);
        return normalized;
    }
}
