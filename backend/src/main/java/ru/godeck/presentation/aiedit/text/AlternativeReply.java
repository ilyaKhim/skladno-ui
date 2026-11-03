package ru.godeck.presentation.aiedit.text;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.core.AlternativeReason;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Reply of an {@code alternative} that is never empty.
 *
 * <p>Model suggestions keep only usable requests. A missing message is replaced by the text of the
 * reason, and when no suggestion is left either, the suggestions of the reason are used too.
 *
 * @param message what the user reads, never blank
 * @param suggestions at most {@link AiEditPolicy#MAX_SUGGESTIONS} ready requests
 */
public record AlternativeReply(String message, List<String> suggestions) {
    private static final String KEY = "presentation.ai-edit.alternative.";
    private static final Pattern SUGGESTION_SEPARATOR = Pattern.compile("\\|");
    private static final String MARKER_OPEN = "{{";
    private static final String MARKER_CLOSE = "}}";

    /**
     * @param reason why there is no variant
     * @param message model message, may be blank
     * @param suggestions raw model suggestions
     */
    public static AlternativeReply of(
            AlternativeReason reason, String message, List<String> suggestions) {
        List<String> usable = usable(suggestions);
        boolean noMessage = message == null || message.isBlank();
        return new AlternativeReply(
                noMessage ? BackendMessages.text(KEY + reason.value() + ".message") : message.strip(),
                noMessage && usable.isEmpty() ? defaults(reason) : usable);
    }

    /** Standard reply of the reason, for an answer the server itself turned into an alternative. */
    public static AlternativeReply standard(AlternativeReason reason) {
        return of(reason, null, List.of());
    }

    private static List<String> defaults(AlternativeReason reason) {
        return Arrays.asList(
                SUGGESTION_SEPARATOR.split(BackendMessages.text(KEY + reason.value() + ".suggestions")));
    }

    private static List<String> usable(List<String> suggestions) {
        return suggestions.stream()
                .map(String::strip)
                .filter(text -> !text.isEmpty())
                .filter(text -> text.length() <= AiEditPolicy.MAX_SUGGESTION_LENGTH)
                .filter(text -> !text.contains(MARKER_OPEN) && !text.contains(MARKER_CLOSE))
                .distinct()
                .limit(AiEditPolicy.MAX_SUGGESTIONS)
                .toList();
    }
}
