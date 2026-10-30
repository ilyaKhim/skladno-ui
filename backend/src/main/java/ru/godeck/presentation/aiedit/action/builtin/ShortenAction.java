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

/** Shortens the text to about 70 % of its length, never above {@code max_chars}. */
@Component
@Order(10)
public class ShortenAction implements TextEditAction {
    public static final String ID = "shorten";
    public static final String NOT_SHORTER = "not_shorter";
    private static final String TASK = "Сократи текст, сохранив главную мысль.";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String labelKey() {
        return "presentation.ai-edit.action.shorten.label";
    }

    @Override
    public String descriptionKey() {
        return "presentation.ai-edit.action.shorten.description";
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

    /** Returns {@code min(max_chars, ceil(length × 0.7))}, at least one character. */
    @Override
    public int targetLength(ResolvedTextTarget target, String source) {
        int shorter = (int) Math.ceil(source.length() * AiEditPolicy.SHORTEN_RATIO);
        return Math.max(1, Math.min(target.maxChars(), shorter));
    }

    @Override
    public List<String> warnings(String source, String result, ResolvedTextTarget target) {
        return result.length() >= source.length() ? List.of(NOT_SHORTER) : List.of();
    }
}
