package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.dto.ConfirmPresentationOutlineRequest;
import ru.godeck.presentation.dto.SavePresentationOutlineRequest;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Rejects unknown root/slide properties and fractional revision/slide numbers at this narrow API
 * boundary.
 */
@Component
public class PresentationOutlineRequestCodec {
    private final ObjectMapper json;

    public PresentationOutlineRequestCodec(ObjectMapper json) {
        this.json = json;
    }

    /** Decodes only the public writable subset, not an unrestricted semantic content document. */
    public SavePresentationOutlineRequest save(JsonNode body) {
        return read(body, SavePresentationOutlineRequest.class);
    }

    /** Confirms an integer revision with no hidden extra mutation parameters. */
    public ConfirmPresentationOutlineRequest confirm(JsonNode body) {
        return read(body, ConfirmPresentationOutlineRequest.class);
    }

    private <T> T read(JsonNode body, Class<T> type) {
        try {
            return json.readerFor(type)
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                    .readValue(json.writeValueAsString(body));
        } catch (RuntimeException invalid) {
            throw new GenerationException(GenerationError.INVALID_OUTLINE);
        }
    }
}
