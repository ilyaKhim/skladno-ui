package ru.godeck.presentation.aiedit.action;

import ru.godeck.presentation.aiedit.core.AiEditContext;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Action over the text of one block. Every implementation is a {@code @Component}; {@link
 * TextEditActionRegistry} collects them, so a new action needs no change to the catalog,
 * validation, prompt or UI. Catalog order follows {@code @Order}.
 */
public interface TextEditAction {
    /** Stable id in the API and the journal, for example {@code shorten}. */
    String id();

    /** {@code messages.properties} key of the button label. */
    String labelKey();

    String descriptionKey();

    ActionUi ui();

    /** Parameters for the catalog and validation. */
    List<ActionParam> params();

    Set<TargetKind> targets();

    /** Extension point for feature flags, plans or template-specific actions. */
    default boolean available(AiEditContext context) {
        return true;
    }

    /** Short task for the model (at most 300 characters); parameters are already validated. */
    String task(Map<String, String> params, ResolvedTextTarget target);

    /**
     * Free-form user request passed to the model as {@code request}, or {@code null}. The request
     * also sets the tone: there is no fixed list of tones.
     */
    default String request(Map<String, String> params) {
        return null;
    }

    default int targetLength(ResolvedTextTarget target, String source) {
        return target.maxChars();
    }

    /** Action-specific warnings about a sanitized result, for example {@code not_shorter}. */
    default List<String> warnings(String source, String result, ResolvedTextTarget target) {
        return List.of();
    }
}
