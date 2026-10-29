package ru.godeck.presentation.aiedit.action;

import org.springframework.stereotype.Component;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.core.AiEditContext;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.dto.AiActionCatalogView;
import ru.godeck.presentation.aiedit.dto.AiActionOptionView;
import ru.godeck.presentation.aiedit.dto.AiActionParamView;
import ru.godeck.presentation.aiedit.dto.AiActionView;
import ru.godeck.presentation.aiedit.dto.AiEditLimitsView;
import ru.godeck.presentation.aiedit.dto.AiVariantsView;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Collects every {@link TextEditAction} bean, verifies the set at startup, validates request
 * parameters and builds the public catalog.
 *
 * <p>Startup checks: ids are unique and match {@link AiEditPolicy#ACTION_ID_PATTERN}, every action
 * has targets and resolvable texts, and there is exactly one {@link ActionUi#INPUT} action with
 * exactly one string parameter (the chat input field sends its message there).
 */
@Component
public class TextEditActionRegistry {
    private static final String INVALID_ACTIONS = "Invalid AI text edit actions: ";
    private final Map<String, TextEditAction> actions;

    public TextEditActionRegistry(List<TextEditAction> actions) {
        Map<String, TextEditAction> byId = new LinkedHashMap<>();
        int inputs = 0;
        for (TextEditAction action : actions) {
            String id = action.id();
            if (id == null || !id.matches(AiEditPolicy.ACTION_ID_PATTERN))
                throw new IllegalStateException(INVALID_ACTIONS + "id " + id);
            if (byId.putIfAbsent(id, action) != null)
                throw new IllegalStateException(INVALID_ACTIONS + "duplicate id " + id);
            if (action.targets() == null || action.targets().isEmpty() || action.ui() == null)
                throw new IllegalStateException(INVALID_ACTIONS + id);
            BackendMessages.text(action.labelKey());
            BackendMessages.text(action.descriptionKey());
            var names = new HashSet<String>();
            for (ActionParam param : action.params()) {
                if (!names.add(param.name()))
                    throw new IllegalStateException(INVALID_ACTIONS + "duplicate param " + id);
                for (ActionParam.Option option : param.options())
                    BackendMessages.text(option.labelKey());
            }
            if (action.ui() == ActionUi.INPUT) {
                inputs++;
                long strings =
                        action.params().stream()
                                .filter(param -> param.type() == ActionParam.Type.STRING)
                                .count();
                if (strings != 1)
                    throw new IllegalStateException(INVALID_ACTIONS + "input action " + id);
            }
        }
        if (inputs != 1) throw new IllegalStateException(INVALID_ACTIONS + "input actions " + inputs);
        this.actions = Collections.unmodifiableMap(byId);
    }

    /** Returns actions in catalog order. */
    public List<TextEditAction> actions() {
        return List.copyOf(actions.values());
    }

    /**
     * Resolves an action that exists, supports the target kind and is available in the context.
     *
     * @throws GenerationException {@code unsupported_action} otherwise
     */
    public TextEditAction require(String id, TargetKind kind, AiEditContext context) {
        TextEditAction action = id == null ? null : actions.get(id);
        if (action == null || !action.targets().contains(kind) || !action.available(context))
            throw new GenerationException(GenerationError.UNSUPPORTED_ACTION);
        return action;
    }

    /**
     * Checks request parameters strictly against the action declaration.
     *
     * <p>Unknown or missing names, blank required strings, values outside enum options and strings
     * longer than {@code max_length} are rejected. String values are trimmed; empty optional values
     * are dropped. The result is sorted by name so the idempotency hash is stable.
     *
     * @throws GenerationException {@code invalid_params}
     */
    public Map<String, String> validate(TextEditAction action, Map<String, String> params) {
        Map<String, String> input = params == null ? Map.of() : params;
        if (input.size() > AiEditPolicy.MAX_PARAMS) invalidParams();
        Map<String, ActionParam> declared = new LinkedHashMap<>();
        for (ActionParam param : action.params()) declared.put(param.name(), param);
        for (String name : input.keySet()) if (!declared.containsKey(name)) invalidParams();
        Map<String, String> valid = new TreeMap<>();
        for (ActionParam param : declared.values()) {
            String raw = input.get(param.name());
            if (input.containsKey(param.name()) && raw == null) invalidParams();
            String value = raw == null ? "" : raw.strip();
            if (value.isEmpty()) {
                if (param.required()) invalidParams();
                continue;
            }
            switch (param.type()) {
                case STRING -> {
                    if (value.length() > param.maxLength()) invalidParams();
                }
                case ENUM -> {
                    if (param.options().stream().noneMatch(option -> option.id().equals(value)))
                        invalidParams();
                }
            }
            valid.put(param.name(), value);
        }
        return Collections.unmodifiableMap(valid);
    }

    /** Builds the public catalog; {@code enabled} reflects whether AI is configured. */
    public AiActionCatalogView catalog(AiEditContext context, boolean enabled) {
        List<AiActionView> views =
                actions.values().stream()
                        .filter(action -> action.available(context))
                        .map(TextEditActionRegistry::view)
                        .toList();
        return new AiActionCatalogView(
                views,
                new AiVariantsView(AiEditPolicy.DEFAULT_VARIANTS, AiEditPolicy.MAX_VARIANTS),
                new AiEditLimitsView(AiEditPolicy.CUSTOM_BLOCK_MAX_INPUT_CHARS),
                enabled);
    }

    private static AiActionView view(TextEditAction action) {
        Set<TargetKind> targets = action.targets();
        return new AiActionView(
                action.id(),
                BackendMessages.text(action.labelKey()),
                BackendMessages.text(action.descriptionKey()),
                action.ui(),
                java.util.Arrays.stream(TargetKind.values()).filter(targets::contains).toList(),
                action.params().stream()
                        .map(
                                param ->
                                        new AiActionParamView(
                                                param.name(),
                                                param.type(),
                                                param.required(),
                                                param.maxLength(),
                                                param.options().stream()
                                                        .map(
                                                                option ->
                                                                        new AiActionOptionView(
                                                                                option.id(),
                                                                                BackendMessages.text(
                                                                                        option
                                                                                                .labelKey())))
                                                        .toList()))
                        .toList());
    }

    private static void invalidParams() {
        throw new GenerationException(GenerationError.INVALID_PARAMS);
    }
}
