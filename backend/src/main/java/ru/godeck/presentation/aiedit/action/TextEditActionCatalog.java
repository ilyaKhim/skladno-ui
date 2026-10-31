package ru.godeck.presentation.aiedit.action;

import org.springframework.stereotype.Component;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.dto.AiActionCatalogView;
import ru.godeck.presentation.aiedit.dto.AiActionParamView;
import ru.godeck.presentation.aiedit.dto.AiActionView;
import ru.godeck.presentation.aiedit.dto.AiEditLimitsView;
import ru.godeck.presentation.aiedit.dto.AiVariantsView;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/** Serves the fixed action catalog and validates exactly the parameters accepted by its API. */
@Component
public class TextEditActionCatalog {
    /** Resolves only supported API identifiers; unknown actions never reach the model. */
    public TextEditAction require(String id) {
        return Arrays.stream(TextEditAction.values())
                .filter(action -> action.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new GenerationException(GenerationError.UNSUPPORTED_ACTION));
    }

    /** Reject unknown keys and nulls; normalization also keeps idempotency hashes stable. */
    public Map<String, String> validate(TextEditAction action, Map<String, String> params) {
        Map<String, String> input = params == null ? Map.of() : params;
        if (action != TextEditAction.CUSTOM) {
            if (!input.isEmpty()) throw new GenerationException(GenerationError.INVALID_PARAMS);
            return Map.of();
        }
        String instruction = input.get(TextEditAction.INSTRUCTION);
        if (input.size() != 1
                || instruction == null
                || instruction.isBlank()
                || instruction.strip().length() > AiEditPolicy.MAX_INSTRUCTION_LENGTH)
            throw new GenerationException(GenerationError.INVALID_PARAMS);
        return Map.of(TextEditAction.INSTRUCTION, instruction.strip());
    }

    /** Preserve the frontend contract, action order and disabled-state metadata. */
    public AiActionCatalogView catalog(boolean enabled) {
        return new AiActionCatalogView(
                Arrays.stream(TextEditAction.values()).map(TextEditActionCatalog::view).toList(),
                new AiVariantsView(AiEditPolicy.DEFAULT_VARIANTS, AiEditPolicy.MAX_VARIANTS),
                new AiEditLimitsView(AiEditPolicy.CUSTOM_BLOCK_MAX_INPUT_CHARS),
                enabled);
    }

    private static AiActionView view(TextEditAction action) {
        return new AiActionView(
                action.id(),
                BackendMessages.text(action.labelKey()),
                BackendMessages.text(action.descriptionKey()),
                action.ui(),
                List.of(TargetKind.TEMPLATE_FIELD, TargetKind.CUSTOM_BLOCK),
                action == TextEditAction.CUSTOM
                        ? List.of(
                                new AiActionParamView(
                                        TextEditAction.INSTRUCTION,
                                        "string",
                                        true,
                                        AiEditPolicy.MAX_INSTRUCTION_LENGTH,
                                        List.of()))
                        : List.of());
    }
}
