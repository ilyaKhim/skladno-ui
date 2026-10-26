package ru.godeck.presentation.mapper;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationEditorDraft;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

/**
 * Serializes the editor staging document stored in {@code generated_presentations.editor_json}.
 *
 * <p>Keeping this codec separate from {@link PresentationContentCodec} makes the distinction
 * between a published semantic document and an unpublished editor snapshot explicit. Decoding
 * failures are converted to the public generation error contract instead of leaking Jackson
 * details through the API.
 */
@Component
public class PresentationEditorDraftCodec {
    private final ObjectMapper mapper;

    public PresentationEditorDraftCodec(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Converts a validated editor snapshot to its database representation.
     *
     * @param draft complete staging document
     * @return JSON persisted atomically with its draft revision
     */
    public String encode(PresentationEditorDraft draft) {
        return mapper.writeValueAsString(draft);
    }

    /**
     * Restores a typed staging document used by editor reads and commit rendering.
     *
     * @param json value read from {@code editor_json}
     * @return typed editor snapshot
     * @throws GenerationException when stored JSON cannot be interpreted safely
     */
    public PresentationEditorDraft decode(String json) {
        return mapper.readerFor(PresentationEditorDraft.class)
                .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .readValue(json);
    }
}
