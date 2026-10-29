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
 * @param status {@code ok}, {@code unchanged} or {@code unsupported}
 * @param message explanation for {@code unchanged}/{@code unsupported}; {@code null} for {@code ok}
 * @param sourceText echo of the request text
 * @param replayed {@code true} when returned from the stored result of the same request id
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextEditView(
        UUID editId,
        UUID requestId,
        UUID refinesEditId,
        AiEditStatus status,
        String message,
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
    public TextEditView asReplay() {
        return new TextEditView(
                editId,
                requestId,
                refinesEditId,
                status,
                message,
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
