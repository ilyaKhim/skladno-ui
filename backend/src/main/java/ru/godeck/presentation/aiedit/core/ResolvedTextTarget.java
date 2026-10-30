package ru.godeck.presentation.aiedit.core;

import java.util.UUID;

/**
 * A target verified against the saved presentation, with its limits and the minimal model context.
 *
 * @param maxChars soft limit that fits the layout
 * @param hardMaxChars limit accepted by editor save
 * @param maxInputChars longest source text accepted for this target
 * @param role field description from the template sidecar, or {@code null}
 * @param deckTitle value of the {@code TITLE} field, or {@code null}
 * @param slideTitle title-like field of the slide, or {@code null} when it is the target itself
 */
public record ResolvedTextTarget(
        UUID presentationId,
        String templateId,
        AiEditTarget target,
        int maxChars,
        int hardMaxChars,
        int maxInputChars,
        String role,
        String deckTitle,
        String slideTitle) {
    public TargetKind kind() {
        return target.kind();
    }
}
