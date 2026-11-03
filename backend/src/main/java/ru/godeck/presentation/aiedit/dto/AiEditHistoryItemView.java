package ru.godeck.presentation.aiedit.dto;

import ru.godeck.presentation.aiedit.core.AiEditStatus;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One record of the AI feed of a presentation. It is its own shape rather than a {@code
 * TextEditView}: the feed is not tied to one kind of journal record.
 *
 * @param instruction text of a {@code custom} request, otherwise {@code null}
 * @param sourceText {@code null} for {@code failed}: the source of such requests is not stored
 * @param maxChars {@code null} for {@code failed}
 * @param hardMaxChars {@code null} for {@code failed}
 * @param outcome {@code applied}, {@code rejected}, {@code reverted} or {@code null}
 * @param outcomeVariant index in {@code variants} for {@code applied}, otherwise {@code null}
 * @param tracked {@code false} for records made before outcomes were collected: there {@code null}
 *     does not mean "not applied"
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiEditHistoryItemView(
        UUID editId,
        Instant createdAt,
        UUID refinesEditId,
        String action,
        String instruction,
        TextEditTargetDto target,
        AiEditStatus status,
        String reason,
        String message,
        List<String> suggestions,
        String sourceText,
        Integer maxChars,
        Integer hardMaxChars,
        List<TextVariantView> variants,
        String outcome,
        Short outcomeVariant,
        boolean tracked) {}
