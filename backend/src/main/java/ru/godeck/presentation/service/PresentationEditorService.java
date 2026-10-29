package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.DRAFT;
import static ru.godeck.presentation.model.PresentationStatus.SUCCEEDED;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.presentation.dto.EditorAssetView;
import ru.godeck.presentation.dto.EditorDeckView;
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
import ru.godeck.presentation.template.EditorTextLimits;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.template.TextLengthMode;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Orchestrates the visual editor without coupling browser state to Apache POI or JPA entities.
 *
 * <p>The service maintains a two-phase model:
 *
 * <ol>
 *   <li>{@link #save(UUID, UUID, SaveEditorDraftRequest)} validates and persists a lightweight
 *       semantic draft under optimistic revision control.
 *   <li>{@link #commit(UUID, UUID, int, long)} reserves an edit lease, renders a file outside the
 *       database transaction, and atomically publishes a new immutable revision.
 * </ol>
 *
 * <p>This separation is why frequent autosaves do not create files or consume the daily edit quota.
 * It also gives commit a stable server-side snapshot and prevents a stale browser tab from
 * overwriting a newer draft.
 */
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

    /**
     * Loads the effective editor document owned by a user.
     *
     * <p>A draft is used only when its base version still equals the published presentation
     * version. Otherwise the editor is reconstructed from canonical {@code content_json}. The
     * template service enriches semantic content with real PPTX shape coordinates and styles.
     *
     * @param userId owner resolved from the authenticated session
     * @param id presentation identifier
     * @return browser-facing deck with optimistic versions and editable blocks
     * @throws GenerationException when the presentation is missing, not ready, or cannot be mapped
     */
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

    /**
     * Validates and stores a complete autosave snapshot under a row lock.
     *
     * <p>Both the published version and draft revision must match. This double comparison prevents
     * writes from an old presentation version and serializes multiple browser tabs without relying
     * on arrival order. The operation stores JSON only; no PPTX or revision record is created.
     *
     * @param userId owner resolved from the authenticated session
     * @param id presentation identifier
     * @param input complete client snapshot and expected versions
     * @return acknowledged base version, incremented draft revision, and save time
     * @throws GenerationException on ownership, state, validation, lease, or version conflict
     */
    @Transactional
    public EditorDraftSavedView save(UUID userId, UUID id, SaveEditorDraftRequest input) {
        Presentation presentation =
                presentations
                        .findForUpdate(id, userId)
                        .orElseThrow(PresentationEditorService::missing);
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

    /**
     * Stores an editor image in the presentation's private asset namespace.
     *
     * <p>Ownership and readiness are checked before bytes are accepted. The storage module performs
     * content decoding and normalization, so the returned metadata describes a trusted PNG rather
     * than browser-provided MIME information.
     *
     * @param userId presentation owner
     * @param id presentation identifier used to scope storage
     * @param upload multipart image supplied by the browser
     * @return opaque asset metadata suitable for insertion into an editor draft
     */
    @Transactional(readOnly = true)
    public EditorAssetView uploadImage(UUID userId, UUID id, MultipartFile upload) {
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

    /**
     * Resolves a private asset after checking that the requesting user owns a ready presentation.
     *
     * @param userId presentation owner
     * @param id presentation identifier
     * @param assetId opaque asset identifier
     * @return validated local path that remains inside the presentation asset directory
     */
    @Transactional(readOnly = true)
    public Path image(UUID userId, UUID id, UUID assetId) {
        Presentation presentation = owned(userId, id);
        ready(presentation);
        return files.image(id, assetId);
    }

    /**
     * Publishes the persisted editor draft as the next PowerPoint revision.
     *
     * <p>The method intentionally spans two short transactions implemented by {@link
     * PresentationTransactions}. Rendering and filesystem I/O happen between them without holding a
     * database lock. A random lease token plus base/draft revisions prove that the same snapshot is
     * still current when publication completes. If rendering or the final commit fails, the new
     * file is discarded and the draft remains available for retry.
     *
     * @param userId presentation owner
     * @param id presentation identifier
     * @param baseVersion expected published version
     * @param draftRevision exact saved draft revision to publish
     * @return metadata for the newly published presentation version
     */
    public PresentationView commit(UUID userId, UUID id, int baseVersion, long draftRevision) {
        var published = transactions.committedEditorDraft(userId, id, baseVersion, draftRevision);
        if (published != null) return published;
        var edit = transactions.beginEditorCommit(userId, id, baseVersion, draftRevision);
        Path output = null;
        try {
            PresentationEditorDraft draft = editorCodec.decode(edit.editorJson());
            PresentationContent content =
                    templates.normalizeEditor(edit.templateId(), draft.content());
            output =
                    files.write(
                            id,
                            edit.baseVersion() + 1,
                            edit.templateId(),
                            content,
                            TextLengthMode.ALLOW_OVERFLOW);
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
                    || field.getValue().length() > EditorTextLimits.hard(limit)) invalid();
        }
        PresentationContent updated =
                templates.normalizeEditor(
                        presentation.getTemplateId(),
                        new PresentationContent(Map.copyOf(fields), List.copyOf(reordered)));
        return new PresentationEditorDraft(input.title().strip(), Map.copyOf(names), updated);
    }

    /**
     * Selects the valid staging snapshot or reconstructs editor state from published content.
     *
     * <p>An editor JSON value based on an older published version is never merged implicitly. This
     * keeps the source of truth unambiguous after AI edits or another successful commit.
     */
    private PresentationEditorDraft currentDraft(Presentation presentation) {
        if (presentation.getEditorJson() != null
                && presentation.getEditorBaseVersion() != null
                && presentation.getEditorBaseVersion() == presentation.getCurrentVersion())
            return editorCodec.decode(presentation.getEditorJson());
        if (presentation.getContentJson() == null)
            throw new GenerationException(GenerationError.CONTENT_UNAVAILABLE);
        PresentationContent content =
                templates.normalizeEditor(
                        presentation.getTemplateId(),
                        contentCodec.decode(presentation.getContentJson()));
        return new PresentationEditorDraft(
                defaultTitle(presentation, content),
                defaultNames(presentation.getTemplateId(), content),
                content);
    }

    /** Derives an initial editor title from the primary template field, then from the topic. */
    private static String defaultTitle(Presentation presentation, PresentationContent content) {
        String title = content.fields().get("TITLE");
        if (title == null || title.isBlank()) title = presentation.getTopic().strip();
        return title.length() > 240 ? title.substring(0, 240) : title;
    }

    /**
     * Builds human-readable slide labels from title-like template fields.
     *
     * <p>Slide names are editor metadata and are not required for PowerPoint rendering; deriving
     * them makes old presentations usable before they have an explicit editor draft.
     */
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

    /**
     * Converts the template manifest into a slide-to-field map used for exact request validation.
     */
    @SuppressWarnings("unchecked")
    private Map<Integer, List<String>> manifest(String templateId) {
        Map<Integer, List<String>> result = new LinkedHashMap<>();
        for (var slide : templates.slideManifest(templateId))
            result.put((Integer) slide.get("slide"), (List<String>) slide.get("fields"));
        return result;
    }

    /** Resolves a presentation only inside the authenticated owner's tenant boundary. */
    private Presentation owned(UUID userId, UUID id) {
        return presentations
                .findByIdAndUserId(id, userId)
                .orElseThrow(PresentationEditorService::missing);
    }

    /** Both unpublished content and a published presentation use the same editor and autosave. */
    private static void ready(Presentation presentation) {
        if (presentation.getStatus() != SUCCEEDED && presentation.getStatus() != DRAFT)
            throw new GenerationException(GenerationError.PRESENTATION_NOT_READY);
    }

    /** Throws the stable public error used for malformed editor snapshots. */
    private static void invalid() {
        throw new GenerationException(GenerationError.INVALID_CONTENT);
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    /** Builds an authenticated API URL; storage paths never leave the backend. */
    private static String imageUrl(UUID presentationId, UUID assetId) {
        return "/api/generation/v1/presentations/" + presentationId + "/editor/assets/" + assetId;
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

    /** Removes path components and control characters before a filename becomes editor alt text. */
    private static String safeImageName(String filename) {
        if (filename == null || filename.isBlank()) return "Изображение";
        String name = filename.replace('\\', '/').replaceAll("[\\p{Cntrl}]", "");
        name = name.substring(name.lastIndexOf('/') + 1).strip();
        if (name.length() > 200) name = name.substring(0, 200);
        return name.isBlank() ? "Изображение" : name;
    }
}
