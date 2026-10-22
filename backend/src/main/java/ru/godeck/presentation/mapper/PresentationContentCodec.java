package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

@Component
public class PresentationContentCodec {
    private final ObjectMapper mapper;

    public PresentationContentCodec(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String encode(PresentationContent content) {
        return mapper.writeValueAsString(content);
    }

    public PresentationContent decode(String json) {
        return mapper.readerFor(PresentationContent.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(json);
    }
}
