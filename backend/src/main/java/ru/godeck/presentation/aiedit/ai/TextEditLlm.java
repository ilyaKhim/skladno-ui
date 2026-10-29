package ru.godeck.presentation.aiedit.ai;

import ru.godeck.presentation.exception.AiGenerationException;

/**
 * Model boundary of AI text edits. Production uses {@link OpenAiTextEditLlm}; the {@code test} and
 * {@code e2e} profiles may use the deterministic {@link ScriptedTextEditLlm}.
 *
 * <p>Implementations make exactly one model call per edit, record it in {@code
 * presentation_ai_calls} with operation {@code TEXT_EDIT} before the call, and are invoked without
 * an open database transaction.
 */
public interface TextEditLlm {
    /** True when the model can be called: AI is enabled and configured. */
    boolean enabled();

    /**
     * Performs one audited model call.
     *
     * @throws AiGenerationException {@code ai_edit_failed} on provider errors, timeouts, incomplete
     *     or schema-violating answers; {@code openai_disabled} when AI is not configured
     */
    TextEditOutcome edit(TextEditPrompt prompt);
}
