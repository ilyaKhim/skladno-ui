package ru.godeck.presentation.aiedit.ai;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AlternativeReason;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.ai.AiCallContext;
import ru.godeck.presentation.ai.AiOperation;
import ru.godeck.presentation.ai.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
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
 *   <li>an empty source gets a short new text;
 *   <li>a marker in the {@code request} selects a scenario: {@code __ALT_SOURCE__}, {@code
 *       __ALT_STYLE__}, {@code __ALT_SCOPE__}, {@code __ADVICE__} and {@code __CLARIFY__} are
 *       alternatives, {@code __NO_SUGGESTIONS__} is an alternative with an empty message and no
 *       suggestions, {@code __FAKE_QUOTE__} and {@code __FAKE_STAT__} disobey the prompt with an
 *       invented quote or statistic, {@code __CHECK_FACTS__} sets {@code check_facts} and {@code
 *       __INCOMPLETE__} is an {@code incomplete} envelope that ran out of output tokens; {@code
 *       __FRAMED_QUOTE__} frames the whole variant in quotes, {@code __BAD_MESSAGE__} and {@code
 *       __BAD_SUGGESTION__} put an invented statistic into an alternative;
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
    public static final String ALT_SOURCE = "__ALT_SOURCE__";
    public static final String ALT_STYLE = "__ALT_STYLE__";
    public static final String ALT_SCOPE = "__ALT_SCOPE__";
    public static final String ADVICE = "__ADVICE__";
    public static final String CLARIFY = "__CLARIFY__";
    public static final String FAKE_QUOTE = "__FAKE_QUOTE__";
    public static final String FAKE_STAT = "__FAKE_STAT__";
    public static final String CHECK_FACTS = "__CHECK_FACTS__";
    public static final String INCOMPLETE = "__INCOMPLETE__";
    public static final String NO_SUGGESTIONS = "__NO_SUGGESTIONS__";
    public static final String FRAMED_QUOTE = "__FRAMED_QUOTE__";
    public static final String BAD_MESSAGE = "__BAD_MESSAGE__";
    public static final String BAD_SUGGESTION = "__BAD_SUGGESTION__";
    public static final String EMPTY_SOURCE_TEXT = "Новый текст для пустого блока";
    public static final int INCOMPLETE_REASONING_TOKENS = 1040;
    public static final int LONG_OVERFLOW = 13;
    private static final String MODEL_ID = "scripted";
    private static final String FAKE_QUOTE_TEXT =
            "Главный инженер сказал: «Оппозитный двигатель останется основой марки»";
    private static final String FAKE_STAT_TEXT = "За год рынок показал рост 37 %";
    private static final String FRAMED_QUOTE_TEXT = "«Мы строим лучшие двигатели в мире»";
    private static final String FACT_TEXT = "Земля вращается вокруг Солнца";
    private static final String STATUS_INCOMPLETE = "incomplete";
    private static final String INCOMPLETE_REASON = "max_output_tokens";
    private static final Map<String, Alternative> ALTERNATIVES =
            Map.of(
                    ALT_SOURCE,
                    new Alternative(
                            AlternativeReason.NEEDS_SOURCE,
                            "Подлинную цитату без источника вставить не могу: её нельзя придумывать.",
                            List.of(
                                    "Вставь заглушку [Цитата: имя, источник]",
                                    "Перескажи мысль своими словами без цитаты")),
                    ALT_STYLE,
                    new Alternative(
                            AlternativeReason.STYLE_PANEL,
                            "Оформление в чате не меняется.",
                            List.of("Сократи текст")),
                    ALT_SCOPE,
                    new Alternative(
                            AlternativeReason.OUT_OF_SCOPE,
                            "Сейчас чат правит один блок.",
                            List.of("Перепиши этот текст яснее")),
                    ADVICE,
                    new Alternative(
                            AlternativeReason.ADVICE,
                            "Текст можно сократить и убрать повторы.",
                            List.of("Сократи текст", "Убери повторы")),
                    BAD_MESSAGE,
                    new Alternative(
                            AlternativeReason.ADVICE,
                            "Рынок вырос на 37 %, так что текст стоит обновить.",
                            List.of("Сократи текст")),
                    BAD_SUGGESTION,
                    new Alternative(
                            AlternativeReason.ADVICE,
                            "Текст можно сократить.",
                            List.of("Напиши, что рост составил 37 %", "Сократи текст")),
                    CLARIFY,
                    new Alternative(
                            AlternativeReason.CLARIFY,
                            "Что именно улучшить: длину или тон?",
                            List.of("Сделай короче", "Сделай формальнее")));
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
            throw new TextEditCallException(
                    AiEditFailureReason.PROVIDER_HTTP, ResponsesUsage.NONE, null);
        }
        String body =
                has(prompt, INCOMPLETE)
                        ? incompleteEnvelope()
                        : envelope(answer(prompt), request.length());
        try {
            TextEditOutcome outcome = responses.parse(body);
            history.complete(callId, body, 200, null, outcome.usage());
            return outcome;
        } catch (TextEditCallException failure) {
            history.complete(callId, body, 200, failure.error().code(), failure.usage());
            throw failure;
        }
    }

    private static boolean has(TextEditPrompt prompt, String marker) {
        return prompt.request() != null && prompt.request().contains(marker);
    }

    private Map<String, Object> answer(TextEditPrompt prompt) {
        for (var scenario : ALTERNATIVES.entrySet())
            if (has(prompt, scenario.getKey())) return alternative(scenario.getValue());
        if (has(prompt, NO_SUGGESTIONS))
            return alternative(new Alternative(AlternativeReason.CLARIFY, "", List.of()));
        boolean checkFacts = has(prompt, CHECK_FACTS);
        String base = base(prompt);
        List<Map<String, Object>> variants = new ArrayList<>();
        for (int index = 0; index < prompt.variants(); index++)
            variants.add(
                    Map.of(
                            "text",
                            index == 0 ? base : base + " (вариант " + (index + 1) + ")",
                            "check_facts",
                            checkFacts));
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("status", TextEditRequestFactory.STATUS_OK);
        answer.put("reason", TextEditRequestFactory.REASON_NONE);
        answer.put("message", "");
        answer.put("suggestions", List.of());
        answer.put("variants", variants);
        return answer;
    }

    private static Map<String, Object> alternative(Alternative alternative) {
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("status", TextEditRequestFactory.STATUS_ALTERNATIVE);
        answer.put("reason", alternative.reason().value());
        answer.put("message", alternative.message());
        answer.put("suggestions", alternative.suggestions());
        answer.put("variants", List.of());
        return answer;
    }

    private static String base(TextEditPrompt prompt) {
        if (has(prompt, FAKE_QUOTE)) return FAKE_QUOTE_TEXT;
        if (has(prompt, FAKE_STAT)) return FAKE_STAT_TEXT;
        if (has(prompt, FRAMED_QUOTE)) return FRAMED_QUOTE_TEXT;
        if (has(prompt, CHECK_FACTS)) return FACT_TEXT;
        String text = prompt.text();
        if (text.isBlank()) return EMPTY_SOURCE_TEXT;
        if (text.contains(HUGE)) return filler(prompt.hardMaxChars() + 20);
        if (text.contains(LONG))
            return filler(Math.min(prompt.maxChars() + LONG_OVERFLOW, prompt.hardMaxChars()));
        List<String> words = new ArrayList<>(Arrays.asList(text.strip().split("\\s+")));
        if (TextEditAction.SHORTEN.id().equals(prompt.action()))
            return String.join(" ", words.subList(0, Math.max(1, words.size() / 2)));
        if (TextEditAction.REPHRASE.id().equals(prompt.action())) Collections.reverse(words);
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

    /** Reasoning spent the whole limit, so the answer stopped before any visible text. */
    private String incompleteEnvelope() {
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("input_tokens", 640);
        usage.put("input_tokens_details", Map.of("cached_tokens", 0));
        usage.put("output_tokens", INCOMPLETE_REASONING_TOKENS);
        usage.put("output_tokens_details", Map.of("reasoning_tokens", INCOMPLETE_REASONING_TOKENS));
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("id", "resp_" + MODEL_ID);
        envelope.put("status", STATUS_INCOMPLETE);
        envelope.put("incomplete_details", Map.of("reason", INCOMPLETE_REASON));
        envelope.put("output", List.of());
        envelope.put("usage", usage);
        return json.writeValueAsString(envelope);
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

    private record Alternative(
            AlternativeReason reason, String message, List<String> suggestions) {}
}
