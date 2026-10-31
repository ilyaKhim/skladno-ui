package ru.godeck.presentation.template;

import org.springframework.stereotype.Service;

import ru.godeck.presentation.editor.dto.EditorDeckView;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.function.Function;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Public template boundary shared by generation, browser editing and export.
 * The catalog owns immutable source data; projection and rendering use the same shape conventions.
 */
@Service
public class PresentationTemplateService {
    public static final String TEMPLATE_ID = TemplateCatalog.TEMPLATE_ID;
    private final TemplateCatalog catalog;
    private final TemplateRenderer renderer;
    private final TemplateEditorMapper editor;

    public PresentationTemplateService(ObjectMapper json, PresentationContentValidator validator) throws Exception {
        catalog = new TemplateCatalog(json, validator);
        renderer = new TemplateRenderer(catalog);
        editor = new TemplateEditorMapper(catalog);
    }

    /** Selectable templates in stable UI order. */
    public List<Map<String, Object>> catalogs() {
        return catalog.catalogs();
    }

    /** Default-template metadata for existing clients. */
    public Map<String, Object> catalog() {
        return catalog.catalog();
    }

    /** Defensive sidecar copy; prompt construction cannot mutate cached metadata. */
    public JsonNode description(String id) {
        return catalog.description(id);
    }

    /** Combines the user's brief with the chosen template's factual guidance. */
    public String withDescription(String id, String topic) {
        return catalog.withDescription(id, topic);
    }

    public Map<String, Integer> fields() {
        return catalog.fields();
    }

    /** Immutable field contract used for validation, JSON Schema and rendering. */
    public Map<String, Integer> fields(String id) {
        return catalog.fields(id);
    }

    /** Defensive copy of the exact template revision used by editor and renderer. */
    public byte[] source(String id) {
        return catalog.source(id);
    }

    /** Versioned artwork URL changes when template source bytes change. */
    public String backgroundUrl(String id, int slideNumber) {
        return catalog.backgroundUrl(id, slideNumber);
    }

    public List<Map<String, Object>> slideManifest() {
        return catalog.slideManifest();
    }

    public List<Map<String, Object>> slideManifest(String id) {
        return catalog.slideManifest(id);
    }

    /** Typed cached manifest for application code, without JSON-map casts. */
    public Map<Integer, List<String>> fieldsBySlide(String id) {
        return catalog.fieldsBySlide(id);
    }

    public List<String> textLayoutIds(String id, int slideNumber) {
        return catalog.textLayoutIds(id, slideNumber);
    }

    public Map<String, String> normalizeValues(Map<String, String> values) {
        return catalog.normalizeValues(values);
    }

    public PresentationContent normalize(PresentationContent content) {
        return catalog.normalize(content);
    }

    /** Generation keeps its original soft-limit truncation policy. */
    public PresentationContent normalize(String id, PresentationContent content) {
        return catalog.normalize(id, content);
    }

    /** Manual edits preserve overflow up to the editor's hard limit. */
    public PresentationContent normalizeEditor(String id, PresentationContent content) {
        return catalog.normalizeEditor(id, content);
    }

    public byte[] render(PresentationContent content) throws Exception {
        return render(TEMPLATE_ID, content);
    }

    public byte[] render(String id, PresentationContent content) throws Exception {
        return render(id, content, assetId -> { throw new GenerationException(GenerationError.IMAGE_NOT_FOUND); });
    }

    public byte[] render(String id, PresentationContent content, Function<String, byte[]> imageResolver) throws Exception {
        return render(id, content, imageResolver, TextLengthMode.TRUNCATE);
    }

    /** Expensive rendering happens outside database transactions; assets are resolved by private opaque ID. */
    public byte[] render(String id, PresentationContent content, Function<String, byte[]> imageResolver, TextLengthMode mode) throws Exception {
        return renderer.render(id, content, imageResolver, mode);
    }

    /** Browser projection uses the same normalized content, layout IDs and dimensions as export. */
    public EditorDeckView editorDeck(String templateId, UUID presentationId, String title,
            int baseVersion, long draftRevision, Map<Integer, String> slideNames,
            PresentationContent content) throws Exception {
        return editor.editorDeck(templateId, presentationId, title, baseVersion, draftRevision, slideNames, content);
    }
}
