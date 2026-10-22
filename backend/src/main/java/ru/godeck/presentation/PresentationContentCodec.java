package ru.godeck.presentation;

import org.springframework.stereotype.Component;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

@Component
class PresentationContentCodec {
    private final ObjectMapper mapper;

    PresentationContentCodec(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    String encode(PresentationContent content) {
        return mapper.writeValueAsString(content);
    }

    PresentationContent decode(String json) {
        return mapper.readerFor(PresentationContent.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(json);
    }
}
