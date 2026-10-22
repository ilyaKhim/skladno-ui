package ru.godeck.presentation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
class PresentationModelCatalog {
    private final String defaultModel;
    private final List<Map<String, String>> items;

    PresentationModelCatalog(@Value("${godeck.generation.model:gpt-6.1-sol}") String defaultModel) {
        this.defaultModel = defaultModel.strip();
        if (!this.defaultModel.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}")) {
            throw new IllegalArgumentException(
                    "OPENAI_MODEL must contain a valid model ID up to 100 characters.");
        }
        var models =
                new ArrayList<>(
                        List.of(
                                Map.of("id", "gpt-6.1-sol", "name", "GPT-6.1 Sol"),
                                Map.of("id", "gpt-6-luna", "name", "GPT-6 Luna"),
                                Map.of("id", "gpt-6-astra", "name", "GPT-6 Astra"),
                                Map.of("id", "gpt-5.6-sol", "name", "GPT-5.6 Sol"),
                                Map.of("id", "gpt-5.6-terra", "name", "GPT-5.6 Terra"),
                                Map.of("id", "gpt-5.6-luna", "name", "GPT-5.6 Luna"),
                                Map.of("id", "gpt-5.4", "name", "GPT-5.4"),
                                Map.of("id", "gpt-5.4-mini", "name", "GPT-5.4 Mini")));
        if (models.stream().noneMatch(model -> model.get("id").equals(this.defaultModel))) {
            models.addFirst(Map.of("id", this.defaultModel, "name", this.defaultModel));
        }
        this.items = List.copyOf(models);
    }

    Map<String, Object> catalog() {
        return Map.of("items", items, "default_model", defaultModel);
    }

    String resolve(String requested) {
        if (requested == null || requested.isBlank()) return defaultModel;
        return items.stream()
                .map(item -> item.get("id"))
                .filter(requested::equals)
                .findFirst()
                .orElseThrow(
                        () ->
                                new GenerationException(
                                        422,
                                        "unsupported_model",
                                        "Выберите модель из доступного списка."));
    }
}
