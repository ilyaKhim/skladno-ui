package ru.godeck.presentation.ai;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class OpenAiResponseReader {
    private static final String COMPLETED_STATUS = "completed";
    private static final String OUTPUT_TEXT_TYPE = "output_text";
    private final ObjectMapper json;
    private final PresentationContentCodec codec;

    public OpenAiResponseReader(ObjectMapper json, PresentationContentCodec codec) {
        this.json = json;
        this.codec = codec;
    }

    public PresentationContent read(String body) {
        JsonNode response = body == null ? null : json.readTree(body);
        if (response == null || !COMPLETED_STATUS.equals(response.path("status").asText())) {
            throw new AiGenerationException(GenerationError.GENERATION_INCOMPLETE);
        }
        var content = new StringBuilder();
        for (JsonNode item : response.path("output")) {
            for (JsonNode part : item.path("content")) {
                if (OUTPUT_TEXT_TYPE.equals(part.path("type").asText())
                        && part.path("text").isString()) {
                    content.append(part.path("text").asText());
                }
            }
        }
        if (content.isEmpty()) throw new AiGenerationException(GenerationError.GENERATION_EMPTY);
        return codec.decode(content.toString());
    }
}
