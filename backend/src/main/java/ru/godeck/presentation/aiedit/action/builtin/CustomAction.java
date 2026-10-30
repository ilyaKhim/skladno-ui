package ru.godeck.presentation.aiedit.action.builtin;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.action.ActionParam;
import ru.godeck.presentation.aiedit.action.ActionUi;
import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Free-form request from the chat input: "сделай формальнее", "ещё короче". The request also sets
 * the tone; there is no separate tone action.
 */
@Component
@Order(30)
public class CustomAction implements TextEditAction {
    public static final String ID = "custom";
    public static final String INSTRUCTION = "instruction";
    private static final String TASK = "Измени текст по просьбе пользователя из поля request.";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String labelKey() {
        return "presentation.ai-edit.action.custom.label";
    }

    @Override
    public String descriptionKey() {
        return "presentation.ai-edit.action.custom.description";
    }

    @Override
    public ActionUi ui() {
        return ActionUi.INPUT;
    }

    @Override
    public List<ActionParam> params() {
        return List.of(ActionParam.string(INSTRUCTION, true, AiEditPolicy.MAX_INSTRUCTION_LENGTH));
    }

    @Override
    public Set<TargetKind> targets() {
        return Set.of(TargetKind.TEMPLATE_FIELD, TargetKind.CUSTOM_BLOCK);
    }

    @Override
    public String task(Map<String, String> params, ResolvedTextTarget target) {
        return TASK;
    }

    @Override
    public String request(Map<String, String> params) {
        return params.get(INSTRUCTION);
    }
}
