package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.SUCCEEDED;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.presentation.dto.EditorDeckView;
import ru.godeck.presentation.dto.EditorAssetView;
import ru.godeck.presentation.dto.EditorDraftSavedView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.dto.SaveEditorDraftRequest;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.mapper.PresentationEditorDraftCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationEditorDraft;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.nio.file.Path;
import java.io.IOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PresentationEditorService {
    private static final Logger log = LoggerFactory.getLogger(PresentationEditorService.class);
    private static final String EDIT_RELEASE_FAILURE_LOG = "Could not release editor commit {}";

    private final PresentationRepository presentations;
    private final PresentationTransactions transactions;
    private final PresentationTemplateService templates;
    private final PresentationContentCodec contentCodec;
    private final PresentationEditorDraftCodec editorCodec;
    private final PresentationFiles files;
    private final Clock clock;

    public PresentationEditorService(
            PresentationRepository presentations,
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentCodec contentCodec,
            PresentationEditorDraftCodec editorCodec,
            PresentationFiles files,
            Clock clock) {
        this.presentations = presentations;
        this.transactions = transactions;
        this.templates = templates;
        this.contentCodec = contentCodec;
        this.editorCodec = editorCodec;
        this.files = files;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public EditorDeckView get(UUID userId, UUID id) {
        Presentation presentation = owned(userId, id);
        ready(presentation);
        PresentationEditorDraft draft = currentDraft(presentation);
        try {
            return templates.editorDeck(
                    presentation.getTemplateId(),
                    id,
                    draft.title(),
                    presentation.getCurrentVersion(),
                    presentation.getEditorRevision(),
                    draft.slideNames(),
                    draft.content());
        } catch (GenerationException known) {
            throw known;
        } catch (Exception error) {
            throw new GenerationException(GenerationError.EDIT_FAILED);
        }
    }

    @Transactional
    public EditorDraftSavedView save(
            UUID userId, UUID id, SaveEditorDraftRequest input) {
        Presentation presentation =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationEditorService::missing);
        ready(presentation);
        if (presentation.getEditId() != null
                && presentation
                        .getEditStartedAt()
                        .isAfter(clock.instant().minus(PresentationPolicy.EDIT_LEASE_TIMEOUT)))
            throw new GenerationException(GenerationError.EDIT_IN_PROGRESS);
        if (presentation.getCurrentVersion() != input.baseVersion()
                || presentation.getEditorRevision() != input.draftRevision())
            throw new GenerationException(GenerationError.EDIT_EXPIRED);

        PresentationEditorDraft draft = apply(presentation, input);
        long revision = presentation.getEditorRevision() + 1;
        var now = clock.instant();
        presentation.saveEditorDraft(
                editorCodec.encode(draft), presentation.getCurrentVersion(), revision, now);
        return new EditorDraftSavedView(
                presentation.getCurrentVersion(), revision, now.getEpochSecond());
    }

    @Transactional(readOnly = true)
    public EditorAssetView uploadImage(
            UUID userId, UUID id, MultipartFile upload) {
        Presentation presentation = owned(userId, id);
        ready(presentation);
        try {
            var asset = files.storeImage(id, upload == null ? null : upload.getBytes());
            String name = safeImageName(upload == null ? null : upload.getOriginalFilename());
            return new EditorAssetView(
                    asset.id().toString(),
                    imageUrl(id, asset.id()),
                    name,
                    asset.width(),
                    asset.height());
        } catch (GenerationException known) {
            throw known;
        } catch (IOException invalid) {
            throw new GenerationException(GenerationError.INVALID_IMAGE);
        }
    }

    @Transactional(readOnly = true)
    public Path image(UUID userId, UUID id, UUID assetId) {
        Presentation presentation = owned(userId, id);
        ready(presentation);
        return files.image(id, assetId);
    }

    public PresentationView commit(
            UUID userId, UUID id, int baseVersion, long draftRevision) {
        var edit = transactions.beginEditorCommit(userId, id, baseVersion, draftRevision);
        Path output = null;
        try {
            PresentationEditorDraft draft = editorCodec.decode(edit.editorJson());
            PresentationContent content = templates.normalize(edit.templateId(), draft.content());
            output = files.write(id, edit.baseVersion() + 1, edit.templateId(), content);
            return transactions.completeEditorCommit(
                    edit, contentCodec.encode(content), output.toString(), content.slideCount());
        } catch (Exception error) {
            files.discard(output);
            try {
                transactions.releaseEditorCommit(edit);
            } catch (Exception cleanup) {
                log.warn(EDIT_RELEASE_FAILURE_LOG, edit.token());
            }
            if (error instanceof GenerationException known) throw known;
            throw new GenerationException(GenerationError.EDIT_FAILED);
        }
    }

    private PresentationEditorDraft apply(Presentation presentation, SaveEditorDraftRequest input) {
        PresentationEditorDraft current = currentDraft(presentation);
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
        Map<Integer, List<String>> manifest = manifest(presentation.getTemplateId());
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
            if (!values.keySet().equals(new LinkedHashSet<>(manifest.getOrDefault(source, List.of()))))
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
                            .map(image -> validatedImageBlock(presentation.getId(), image))
                            .toList();
            List<PresentationContent.TextLayout> textLayouts =
                    validatedTextLayouts(
                            presentation.getTemplateId(), source, decision, inputSlide);
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
        Map<String, Integer> limits = templates.fields(presentation.getTemplateId());
        if (!fields.keySet().equals(limits.keySet())) invalid();
        for (var field : fields.entrySet()) {
            Integer limit = limits.get(field.getKey());
            if (field.getValue() == null
                    || field.getValue().contains("{{")
                    || field.getValue().contains("}}")
                    || limit == null
                    || field.getValue().length() > limit) invalid();
        }
        PresentationContent updated =
                templates.normalize(
                        presentation.getTemplateId(),
                        new PresentationContent(Map.copyOf(fields), List.copyOf(reordered)));
        return new PresentationEditorDraft(input.title().strip(), Map.copyOf(names), updated);
    }

    private PresentationEditorDraft currentDraft(Presentation presentation) {
        if (presentation.getEditorJson() != null
                && presentation.getEditorBaseVersion() != null
                && presentation.getEditorBaseVersion() == presentation.getCurrentVersion())
            return editorCodec.decode(presentation.getEditorJson());
        if (presentation.getContentJson() == null)
            throw new GenerationException(GenerationError.CONTENT_UNAVAILABLE);
        PresentationContent content =
                templates.normalize(
                        presentation.getTemplateId(),
                        contentCodec.decode(presentation.getContentJson()));
        return new PresentationEditorDraft(
                defaultTitle(presentation, content),
                defaultNames(presentation.getTemplateId(), content),
                content);
    }

    private static String defaultTitle(Presentation presentation, PresentationContent content) {
        String title = content.fields().get("TITLE");
        if (title == null || title.isBlank()) title = presentation.getTopic().strip();
        return title.length() > 240 ? title.substring(0, 240) : title;
    }

    private Map<Integer, String> defaultNames(String templateId, PresentationContent content) {
        Map<Integer, List<String>> manifest = manifest(templateId);
        Map<Integer, String> names = new LinkedHashMap<>();
        for (var decision : content.slides()) {
            if (!Boolean.TRUE.equals(decision.include())) continue;
            String name =
                    manifest.getOrDefault(decision.slide(), List.of()).stream()
                            .filter(field -> field.contains("TITLE") || field.equals("STATEMENT"))
                            .map(content.fields()::get)
                            .filter(value -> value != null && !value.isBlank())
                            .findFirst()
                            .orElse("Слайд " + decision.slide());
            names.put(decision.slide(), name.length() > 120 ? name.substring(0, 120) : name);
        }
        return Map.copyOf(names);
    }

    @SuppressWarnings("unchecked")
    private Map<Integer, List<String>> manifest(String templateId) {
        Map<Integer, List<String>> result = new LinkedHashMap<>();
        for (var slide : templates.slideManifest(templateId))
            result.put((Integer) slide.get("slide"), (List<String>) slide.get("fields"));
        return result;
    }

    private Presentation owned(UUID userId, UUID id) {
        return presentations
                .findByIdAndUserId(id, userId)
                .orElseThrow(PresentationEditorService::missing);
    }

    private static void ready(Presentation presentation) {
        if (presentation.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.PRESENTATION_NOT_READY);
    }

    private static void invalid() {
        throw new GenerationException(GenerationError.INVALID_CONTENT);
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    private static String imageUrl(UUID presentationId, UUID assetId) {
        return "/api/generation/v1/presentations/"
                + presentationId
                + "/editor/assets/"
                + assetId;
    }

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

    private static String safeImageName(String filename) {
        if (filename == null || filename.isBlank()) return "Изображение";
        String name = filename.replace('\\', '/').replaceAll("[\\p{Cntrl}]", "");
        name = name.substring(name.lastIndexOf('/') + 1).strip();
        if (name.length() > 200) name = name.substring(0, 200);
        return name.isBlank() ? "Изображение" : name;
    }
}
