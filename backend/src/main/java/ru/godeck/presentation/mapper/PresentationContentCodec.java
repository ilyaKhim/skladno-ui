package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

/**
 * Strict JSON boundary for persisted {@link PresentationContent} snapshots.
 *
 * <p>Encoding is centralized so database revisions and AI/editor inputs use the same wire shape.
 * Decoding rejects unknown properties and floating-point values for integer fields, preventing a
 * newer or malformed payload from being silently reinterpreted by older application code.
 */
@Component
public class PresentationContentCodec {
    private final ObjectMapper mapper;

    public PresentationContentCodec(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** Serializes one complete semantic snapshot for persistence or prompt construction. */
    public String encode(PresentationContent content) {
        return mapper.writeValueAsString(content);
    }

    /** Strictly decodes persisted/provider JSON into the semantic document model. */
    public PresentationContent decode(String json) {
        return mapper.readerFor(PresentationContent.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(json);
    }
}
