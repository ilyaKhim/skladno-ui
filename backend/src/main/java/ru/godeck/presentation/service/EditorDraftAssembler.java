package ru.godeck.presentation.service;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.dto.SaveEditorDraftRequest;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationEditorDraft;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.EditorTextLimits;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Validates a full browser snapshot and builds semantic content; it never persists or publishes. */
@Component
public class EditorDraftAssembler {
    private final PresentationTemplateService templates;
    private final PresentationFiles files;

    public EditorDraftAssembler(PresentationTemplateService templates, PresentationFiles files) {
        this.templates = templates;
        this.files = files;
    }

    /**
     * Applies a browser snapshot to the current semantic document and enforces round-trip
     * invariants.
     *
     * <p>The client must return exactly the included source slides and exactly the template fields
     * available on each slide. Repeated semantic fields must agree across occurrences. Template
     * layout ids are validated against the source PPTX, and every image must resolve inside this
     * presentation's asset namespace. These checks stop a crafted request from introducing unknown
     * placeholders, foreign assets, or shape ids that the renderer cannot address.
     */
    public PresentationEditorDraft assemble(
            UUID presentationId,
            String templateId,
            PresentationEditorDraft current,
            SaveEditorDraftRequest input) {
        PresentationContent content = current.content();
        Map<Integer, PresentationContent.Slide> decisions = new LinkedHashMap<>();
        for (var slide : content.slides()) decisions.put(slide.slide(), slide);

        LinkedHashSet<Integer> expectedSlides = new LinkedHashSet<>();
        for (var slide : content.slides())
            if (Boolean.TRUE.equals(slide.include())) expectedSlides.add(slide.slide());
        LinkedHashSet<Integer> actualSlides = new LinkedHashSet<>();
        for (var slide : input.slides()) {
            if (!actualSlides.add(slide.sourceSlideNumber())) invalid();
        }
        if (!new HashSet<>(actualSlides).equals(expectedSlides)) invalid();
        Map<Integer, List<String>> manifest = templates.fieldsBySlide(templateId);
        Map<String, String> changedValues = new LinkedHashMap<>();
        Map<Integer, String> names = new LinkedHashMap<>();
        List<PresentationContent.Slide> reordered = new ArrayList<>();
        for (var inputSlide : input.slides()) {
            int source = inputSlide.sourceSlideNumber();
            var decision = decisions.get(source);
            if (decision == null || !Boolean.TRUE.equals(decision.include())) invalid();
            names.put(source, inputSlide.name().strip());

            LinkedHashMap<String, String> values = new LinkedHashMap<>();
            for (var block : inputSlide.blocks()) {
                if (values.putIfAbsent(block.fieldKey(), block.text()) != null) invalid();
            }
            if (!values.keySet()
                    .equals(new LinkedHashSet<>(manifest.getOrDefault(source, List.of()))))
                invalid();
            for (var value : values.entrySet()) {
                String previous = changedValues.putIfAbsent(value.getKey(), value.getValue());
                if (previous != null && !previous.equals(value.getValue())) invalid();
            }
            List<PresentationContent.TextBlock> customBlocks =
                    inputSlide.customBlocksOrEmpty().stream()
                            .map(
                                    block ->
                                            new PresentationContent.TextBlock(
                                                    block.id(),
                                                    block.text(),
                                                    block.x(),
                                                    block.y(),
                                                    block.width(),
                                                    block.height(),
                                                    block.fontSize(),
                                                    block.weight(),
                                                    block.align(),
                                                    block.color()))
                            .toList();
            List<PresentationContent.ImageBlock> imageBlocks =
                    inputSlide.imagesOrEmpty().stream()
                            .map(image -> validatedImageBlock(presentationId, image))
                            .toList();
            List<PresentationContent.TextLayout> textLayouts =
                    validatedTextLayouts(
                            templateId, source, decision, inputSlide);
            reordered.add(
                    new PresentationContent.Slide(
                            source,
                            true,
                            decision.reason(),
                            inputSlide.hidden(),
                            customBlocks,
                            imageBlocks,
                            textLayouts));
        }
        for (var decision : content.slides())
            if (!Boolean.TRUE.equals(decision.include())) reordered.add(decision);

        Map<String, String> fields = new LinkedHashMap<>(content.fields());
        fields.putAll(changedValues);
        Map<String, Integer> limits = templates.fields(templateId);
        if (!fields.keySet().equals(limits.keySet())) invalid();
        for (var field : fields.entrySet()) {
            Integer limit = limits.get(field.getKey());
            if (field.getValue() == null
                    || field.getValue().contains("{{")
                    || field.getValue().contains("}}")
                    || limit == null
                    || field.getValue().length() > EditorTextLimits.hard(limit)) invalid();
        }
        PresentationContent updated =
                templates.normalizeEditor(
                        templateId,
                        new PresentationContent(Map.copyOf(fields), List.copyOf(reordered)));
        return new PresentationEditorDraft(input.title().strip(), Map.copyOf(names), updated);
    }

    /**
     * Resolves and verifies an image reference supplied inside draft JSON.
     *
     * <p>The lookup is deliberately performed during autosave, not deferred until export, so a
     * draft cannot acknowledge a missing or cross-presentation asset.
     */
    private PresentationContent.ImageBlock validatedImageBlock(
            UUID presentationId, SaveEditorDraftRequest.ImageBlock image) {
        UUID assetId;
        try {
            assetId = UUID.fromString(image.assetId());
        } catch (IllegalArgumentException invalidAssetId) {
            throw new GenerationException(GenerationError.INVALID_CONTENT);
        }
        files.image(presentationId, assetId);
        return new PresentationContent.ImageBlock(
                image.id(),
                assetId.toString(),
                image.alt(),
                image.x(),
                image.y(),
                image.width(),
                image.height());
    }

    /**
     * Accepts only the complete set of layout ids discovered for the source slide.
     *
     * <p>Requiring the exact set prevents partial snapshots from silently resetting other shapes
     * and prevents unknown ids from being persisted until a later render failure.
     */
    private List<PresentationContent.TextLayout> validatedTextLayouts(
            String templateId,
            int slideNumber,
            PresentationContent.Slide current,
            SaveEditorDraftRequest.Slide input) {
        if (input.layoutsOrEmpty().isEmpty()) return current.textLayoutsOrEmpty();
        var expected = new LinkedHashSet<>(templates.textLayoutIds(templateId, slideNumber));
        var actual = new LinkedHashSet<String>();
        List<PresentationContent.TextLayout> layouts =
                input.layoutsOrEmpty().stream()
                        .map(
                                layout -> {
                                    if (!actual.add(layout.id())) invalid();
                                    return new PresentationContent.TextLayout(
                                            layout.id(),
                                            layout.x(),
                                            layout.y(),
                                            layout.width(),
                                            layout.height());
                                })
                        .toList();
        if (!actual.equals(expected)) invalid();
        return layouts;
    }

    /** Throws the stable public error used for malformed editor snapshots. */
    private static void invalid() {
        throw new GenerationException(GenerationError.INVALID_CONTENT);
    }

}
