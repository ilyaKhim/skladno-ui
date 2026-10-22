package ru.godeck.presentation.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.policy.PresentationPolicy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class PresentationModelCatalog {
    private static final String INVALID_MODEL_FORMAT =
            "OPENAI_MODEL must contain a valid model ID up to %d characters.";
    private static final List<Map<String, String>> SUPPORTED_MODELS =
            List.of(
                    Map.of("id", "gpt-6.1-sol", "name", "GPT-6.1 Sol"),
                    Map.of("id", "gpt-6-luna", "name", "GPT-6 Luna"),
                    Map.of("id", "gpt-6-astra", "name", "GPT-6 Astra"),
                    Map.of("id", "gpt-5.6-sol", "name", "GPT-5.6 Sol"),
                    Map.of("id", "gpt-5.6-terra", "name", "GPT-5.6 Terra"),
                    Map.of("id", "gpt-5.6-luna", "name", "GPT-5.6 Luna"),
                    Map.of("id", "gpt-5.4", "name", "GPT-5.4"),
                    Map.of("id", "gpt-5.4-mini", "name", "GPT-5.4 Mini"));

    private final String defaultModel;
    private final List<Map<String, String>> items;

    public PresentationModelCatalog(
            @Value("${godeck.generation.model:gpt-6.1-sol}") String defaultModel) {
        this.defaultModel = defaultModel.strip();
        if (!this.defaultModel.matches(PresentationPolicy.MODEL_ID_PATTERN)) {
            throw new IllegalArgumentException(
                    INVALID_MODEL_FORMAT.formatted(PresentationPolicy.MODEL_ID_MAX_LENGTH));
        }
        var models = new ArrayList<>(SUPPORTED_MODELS);
        if (models.stream().noneMatch(model -> model.get("id").equals(this.defaultModel))) {
            models.addFirst(Map.of("id", this.defaultModel, "name", this.defaultModel));
        }
        this.items = List.copyOf(models);
    }

    public Map<String, Object> catalog() {
        return Map.of("items", items, "default_model", defaultModel);
    }

    public String resolve(String requested) {
        if (requested == null || requested.isBlank()) return defaultModel;
        return items.stream()
                .map(item -> item.get("id"))
                .filter(requested::equals)
                .findFirst()
                .orElseThrow(() -> new GenerationException(GenerationError.UNSUPPORTED_MODEL));
    }
}
