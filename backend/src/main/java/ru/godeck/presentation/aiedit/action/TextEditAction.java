package ru.godeck.presentation.aiedit.action;

import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;

import java.util.List;
import java.util.Map;

/** The three supported text operations; no plugin discovery or unused parameter language. */
public enum TextEditAction {
    SHORTEN("shorten", "Сократи текст, сохранив главную мысль."),
    REPHRASE(
            "rephrase",
            "Переформулируй текст другими словами, сохранив смысл и примерно ту же длину."),
    CUSTOM("custom", "Измени текст по просьбе пользователя из поля request.");

    public static final String INSTRUCTION = "instruction";
    private final String id;
    private final String task;

    TextEditAction(String id, String task) {
        this.id = id;
        this.task = task;
    }

    /** Stable API and journal identifier, independent of the enum's Java name. */
    public String id() {
        return id;
    }

    public String labelKey() {
        return "presentation.ai-edit.action." + id + ".label";
    }

    public String descriptionKey() {
        return "presentation.ai-edit.action." + id + ".description";
    }

    public ActionUi ui() {
        return this == CUSTOM ? ActionUi.INPUT : ActionUi.QUICK;
    }

    public String task() {
        return task;
    }

    /** Parameters have already been validated; only CUSTOM carries a user instruction. */
    public String request(Map<String, String> params) {
        return this == CUSTOM ? params.get(INSTRUCTION) : null;
    }

    /** Keep the existing length guidance; it is not a license to truncate the AI answer. */
    public int targetLength(ResolvedTextTarget target, String source, double shortenRatio) {
        int length =
                switch (this) {
                    case SHORTEN -> (int) Math.ceil(source.length() * shortenRatio);
                    case REPHRASE -> source.length();
                    case CUSTOM -> target.maxChars();
                };
        return Math.max(1, Math.min(target.maxChars(), length));
    }

    public List<String> warnings(String source, String result) {
        return this == SHORTEN && result.length() >= source.length()
                ? List.of("not_shorter")
                : List.of();
    }
}
