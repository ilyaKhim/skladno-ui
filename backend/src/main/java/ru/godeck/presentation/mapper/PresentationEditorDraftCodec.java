package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.model.PresentationEditorDraft;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

@Component
public class PresentationEditorDraftCodec {
    private final ObjectMapper mapper;

    public PresentationEditorDraftCodec(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String encode(PresentationEditorDraft draft) {
        return mapper.writeValueAsString(draft);
    }

    public PresentationEditorDraft decode(String json) {
        return mapper.readerFor(PresentationEditorDraft.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(json);
    }
}
