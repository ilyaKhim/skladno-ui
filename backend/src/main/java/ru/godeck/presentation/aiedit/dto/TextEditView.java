package ru.godeck.presentation.aiedit.dto;

import ru.godeck.presentation.aiedit.core.AiEditStatus;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.UUID;

/**
 * Proposal for one block. The presentation document is not changed: the browser applies a variant
 * as an ordinary editor change.
 *
 * @param status {@code ok}, {@code unchanged} or {@code alternative}; {@code unsupported} only in
 *     replays of old records
 * @param reason why there is an alternative; a string so that any stored value stays readable
 * @param message reply for {@code unchanged} and {@code alternative}; {@code null} for {@code ok}
 * @param suggestions ready {@code custom} requests for the same target; never {@code null}
 * @param sourceText echo of the request text
 * @param replayed {@code true} when returned from the stored result of the same request id
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextEditView(
        UUID editId,
        UUID requestId,
        UUID refinesEditId,
        AiEditStatus status,
        String reason,
        String message,
        List<String> suggestions,
        String action,
        TextEditTargetDto target,
        String sourceText,
        int maxChars,
        int hardMaxChars,
        List<TextVariantView> variants,
        String model,
        AiUsageView usage,
        AiQuotaView quota,
        boolean replayed) {
    public TextEditView {
        // Results stored before this field existed do not have the key.
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
    }

    public TextEditView asReplay() {
        return new TextEditView(
                editId,
                requestId,
                refinesEditId,
                status,
                reason,
                message,
                suggestions,
                action,
                target,
                sourceText,
                maxChars,
                hardMaxChars,
                variants,
                model,
                usage,
                quota,
                true);
    }
}
