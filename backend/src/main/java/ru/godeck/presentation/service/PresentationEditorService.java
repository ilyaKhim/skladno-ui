package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.DRAFT;
import static ru.godeck.presentation.model.PresentationStatus.SUCCEEDED;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.presentation.config.GenerationSettings;
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
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.template.TextLengthMode;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.util.LinkedHashMap;
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
 * <p>This separation is why frequent autosaves do not create files or consume the edit quota.
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
    private final GenerationSettings settings;
    private final EditorDraftAssembler drafts;

    public PresentationEditorService(
            PresentationRepository presentations,
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentCodec contentCodec,
            PresentationEditorDraftCodec editorCodec,
            PresentationFiles files,
            Clock clock,
            GenerationSettings settings,
            EditorDraftAssembler drafts) {
        this.presentations = presentations;
        this.transactions = transactions;
        this.templates = templates;
        this.contentCodec = contentCodec;
        this.editorCodec = editorCodec;
        this.files = files;
        this.clock = clock;
        this.settings = settings;
        this.drafts = drafts;
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
                        .isAfter(clock.instant().minus(settings.editLeaseTimeout())))
            throw new GenerationException(GenerationError.EDIT_IN_PROGRESS);
        if (presentation.getCurrentVersion() != input.baseVersion()
                || presentation.getEditorRevision() != input.draftRevision())
            throw new GenerationException(GenerationError.EDIT_EXPIRED);

        PresentationEditorDraft draft = drafts.assemble(
                id, presentation.getTemplateId(), currentDraft(presentation), input);
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
        Map<Integer, List<String>> manifest = templates.fieldsBySlide(templateId);
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

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    /** Builds an authenticated API URL; storage paths never leave the backend. */
    private static String imageUrl(UUID presentationId, UUID assetId) {
        return "/api/generation/v1/presentations/" + presentationId + "/editor/assets/" + assetId;
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
