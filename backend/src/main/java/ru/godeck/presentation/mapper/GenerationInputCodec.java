package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.model.GenerationInput;

import tools.jackson.databind.ObjectMapper;

/** Preserves nullable legacy jobs while serializing the exact canonical generation snapshot. */
@Component
public class GenerationInputCodec {
    private final ObjectMapper json;

    public GenerationInputCodec(ObjectMapper json) {
        this.json = json;
    }

    /** Null remains SQL NULL so legacy generation follows its original path. */
    public String encode(GenerationInput input) {
        return input == null ? null : json.writeValueAsString(input);
    }

    /** Reconstructs the immutable claim snapshot without reading an upload or browser state. */
    public GenerationInput decode(String input) {
        return input == null ? null : json.readValue(input, GenerationInput.class);
    }
}
