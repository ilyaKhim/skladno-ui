package ru.godeck.presentation.aiedit.ai;

import java.util.UUID;

/**
 * Everything the model receives for one text edit, already minimized and validated.
 *
 * @param action action id; used by the scripted stub and logs, not sent to the model
 * @param task short task including the target length
 * @param hardMaxChars not sent to the model; lets the scripted stub produce boundary cases
 * @param request free-form user request, or {@code null}
 */
public record TextEditPrompt(
        UUID presentationId,
        String model,
        String action,
        String task,
        int maxChars,
        int hardMaxChars,
        String role,
        String deckTitle,
        String slideTitle,
        String request,
        int variants,
        String text) {}
