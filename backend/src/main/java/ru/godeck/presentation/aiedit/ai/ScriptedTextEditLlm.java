package ru.godeck.presentation.aiedit.ai;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.action.builtin.CustomAction;
import ru.godeck.presentation.aiedit.action.builtin.RephraseAction;
import ru.godeck.presentation.aiedit.action.builtin.ShortenAction;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Deterministic model stub for integration and E2E tests; it never calls a provider.
 *
 * <p>Enabled by {@code godeck.ai-edit.llm=scripted} and only in the {@code test} or {@code e2e}
 * profile: in any other profile the application refuses to start. It builds the real request, stores
 * it in {@code presentation_ai_calls} exactly like the production model, and answers with a
 * synthetic Responses API envelope parsed by the production parser.
 *
 * <ul>
 *   <li>{@code shorten} returns the first words of the source; {@code rephrase} returns the words in
 *       reverse order; other actions move the first word to the end;
 *   <li>{@code custom} whose request mentions «слайд» is {@code unsupported};
 *   <li>a source containing {@code __LONG__} yields a variant longer than {@code max_chars} (by 13
 *       when the hard limit allows) but not longer than {@code hard_max_chars};
 *   <li>{@code __HUGE__} yields a variant longer than {@code hard_max_chars};
 *   <li>{@code __FAIL__} is a provider error (HTTP 500).
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "godeck.ai-edit.llm", havingValue = "scripted")
public class ScriptedTextEditLlm implements TextEditLlm {
    public static final String LONG = "__LONG__";
    public static final String HUGE = "__HUGE__";
    public static final String FAIL = "__FAIL__";
    public static final int LONG_OVERFLOW = 13;
    private static final String MODEL_ID = "scripted";
    private static final String UNSUPPORTED_WORD = "слайд";
    private static final String FILLER = "Длинный вариант текста ";
    private static final String PROFILES_REQUIRED =
            "godeck.ai-edit.llm=scripted is allowed only in the test or e2e profile.";
    private static final int PROVIDER_ERROR_STATUS = 500;
    private static final String PROVIDER_ERROR_BODY = "{\"error\":{\"message\":\"scripted failure\"}}";

    private final TextEditRequestFactory requests;
    private final TextEditResponseParser responses;
    private final PresentationAiCallHistory history;
    private final ObjectMapper json;

    public ScriptedTextEditLlm(
            Environment environment,
            TextEditRequestFactory requests,
            TextEditResponseParser responses,
            PresentationAiCallHistory history,
            ObjectMapper json) {
        if (!environment.matchesProfiles("test", "e2e"))
            throw new IllegalStateException(PROFILES_REQUIRED);
        this.requests = requests;
        this.responses = responses;
        this.history = history;
        this.json = json;
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public TextEditOutcome edit(TextEditPrompt prompt) {
        String request = json.writeValueAsString(requests.create(prompt));
        UUID callId =
                history.start(
                        new AiCallContext(prompt.presentationId(), AiOperation.TEXT_EDIT),
                        prompt.model(),
                        request);
        if (prompt.text().contains(FAIL)) {
            history.complete(
                    callId,
                    PROVIDER_ERROR_BODY,
                    PROVIDER_ERROR_STATUS,
                    GenerationError.AI_EDIT_FAILED.code(),
                    ResponsesUsage.NONE);
            throw new AiGenerationException(GenerationError.AI_EDIT_FAILED);
        }
        String body = envelope(answer(prompt), request.length());
        try {
            TextEditOutcome outcome = responses.parse(body);
            history.complete(callId, body, 200, null, outcome.usage());
            return outcome;
        } catch (AiGenerationException failure) {
            history.complete(callId, body, 200, failure.error().code(), ResponsesUsage.NONE);
            throw failure;
        }
    }

    private Map<String, Object> answer(TextEditPrompt prompt) {
        Map<String, Object> answer = new LinkedHashMap<>();
        if (CustomAction.ID.equals(prompt.action())
                && prompt.request() != null
                && prompt.request().toLowerCase(Locale.ROOT).contains(UNSUPPORTED_WORD)) {
            answer.put("status", TextEditRequestFactory.STATUS_UNSUPPORTED);
            answer.put("message", BackendMessages.text("presentation.ai-edit.unsupported"));
            answer.put("variants", List.of());
            return answer;
        }
        String base = base(prompt);
        List<Map<String, String>> variants = new ArrayList<>();
        for (int index = 0; index < prompt.variants(); index++)
            variants.add(Map.of("text", index == 0 ? base : base + " (вариант " + (index + 1) + ")"));
        answer.put("status", TextEditRequestFactory.STATUS_OK);
        answer.put("message", "");
        answer.put("variants", variants);
        return answer;
    }

    private static String base(TextEditPrompt prompt) {
        String text = prompt.text();
        if (text.contains(HUGE)) return filler(prompt.hardMaxChars() + 20);
        if (text.contains(LONG))
            return filler(Math.min(prompt.maxChars() + LONG_OVERFLOW, prompt.hardMaxChars()));
        List<String> words = new ArrayList<>(Arrays.asList(text.strip().split("\\s+")));
        if (ShortenAction.ID.equals(prompt.action()))
            return String.join(" ", words.subList(0, Math.max(1, words.size() / 2)));
        if (RephraseAction.ID.equals(prompt.action())) Collections.reverse(words);
        else if (words.size() > 1) words.add(words.removeFirst());
        return String.join(" ", words);
    }

    /** Text of exactly {@code length} characters without edge spaces, quotes or markdown. */
    static String filler(int length) {
        var text = new StringBuilder();
        while (text.length() < length) text.append(FILLER);
        char[] chars = text.substring(0, length).toCharArray();
        if (chars.length > 0 && chars[chars.length - 1] == ' ') chars[chars.length - 1] = 'а';
        return new String(chars);
    }

    private String envelope(Map<String, Object> answer, int requestLength) {
        String output = json.writeValueAsString(answer);
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("input_tokens", Math.max(1, requestLength / 3));
        usage.put("input_tokens_details", Map.of("cached_tokens", 0));
        usage.put("output_tokens", Math.max(1, output.length() / 3));
        usage.put("output_tokens_details", Map.of("reasoning_tokens", 0));
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("id", "resp_" + MODEL_ID);
        envelope.put("status", "completed");
        envelope.put(
                "output",
                List.of(
                        Map.of(
                                "type",
                                "message",
                                "content",
                                List.of(Map.of("type", "output_text", "text", output)))));
        envelope.put("usage", usage);
        return json.writeValueAsString(envelope);
    }
}
