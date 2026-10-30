package ru.godeck.presentation.aiedit.action.builtin;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.action.ActionParam;
import ru.godeck.presentation.aiedit.action.ActionUi;
import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Rewrites the text in other words at about the same length, never above {@code max_chars}. */
@Component
@Order(20)
public class RephraseAction implements TextEditAction {
    public static final String ID = "rephrase";
    private static final String TASK =
            "Переформулируй текст другими словами, сохранив смысл и примерно ту же длину.";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String labelKey() {
        return "presentation.ai-edit.action.rephrase.label";
    }

    @Override
    public String descriptionKey() {
        return "presentation.ai-edit.action.rephrase.description";
    }

    @Override
    public ActionUi ui() {
        return ActionUi.QUICK;
    }

    @Override
    public List<ActionParam> params() {
        return List.of();
    }

    @Override
    public Set<TargetKind> targets() {
        return Set.of(TargetKind.TEMPLATE_FIELD, TargetKind.CUSTOM_BLOCK);
    }

    @Override
    public String task(Map<String, String> params, ResolvedTextTarget target) {
        return TASK;
    }

    /** Returns the source length, capped by {@code max_chars}. */
    @Override
    public int targetLength(ResolvedTextTarget target, String source) {
        return Math.max(1, Math.min(target.maxChars(), source.length()));
    }
}
