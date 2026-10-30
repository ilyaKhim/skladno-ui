package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.*;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.common.security.Hashing;
import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.ai.PresentationContentGenerator;
import ru.godeck.presentation.ai.PresentationModelCatalog;
import ru.godeck.presentation.ai.PresentationPrompts;
import ru.godeck.presentation.dto.ChatReply;
import ru.godeck.presentation.dto.PresentationAiCallView;
import ru.godeck.presentation.dto.PresentationPage;
import ru.godeck.presentation.dto.PresentationRevisionView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.GenerationInputCodec;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.model.GenerationInput;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.SourceMaterial;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.repository.OffsetPageRequest;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.repository.PresentationRevisionRepository;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.nio.file.Path;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Application facade for presentation discovery, creation, history, downloads, and AI edits.
 *
 * <p>Fast database-only operations are handled directly here. Operations that combine a database
 * state transition with slow AI/file work are split through {@link PresentationTransactions}: the
 * transaction layer reserves an immutable input snapshot, this service performs external work, and
 * a second transaction conditionally publishes the result. That boundary prevents database locks
 * from being held while calling a provider or writing a PPTX.
 */
@Service
public class PresentationService {
    private static final String EDIT_RELEASE_FAILURE_LOG = "Could not release edit {}";

    private static final Logger log = LoggerFactory.getLogger(PresentationService.class);
    private final PresentationRepository presentations;
    private final PresentationRevisionRepository revisions;
    private final PresentationTransactions transactions;
    private final PresentationTemplateService templates;
    private final PresentationContentGenerator generator;
    private final PresentationModelCatalog models;
    private final PresentationContentCodec codec;
    private final PresentationFiles files;
    private final Clock clock;
    private final PresentationAiCallHistory aiHistory;
    private final GenerationInputCodec inputs;

    public PresentationService(
            PresentationRepository presentations,
            PresentationRevisionRepository revisions,
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentGenerator generator,
            PresentationModelCatalog models,
            PresentationContentCodec codec,
            PresentationFiles files,
            Clock clock,
            PresentationAiCallHistory aiHistory,
            GenerationInputCodec inputs) {
        this.presentations = presentations;
        this.revisions = revisions;
        this.transactions = transactions;
        this.templates = templates;
        this.generator = generator;
        this.models = models;
        this.codec = codec;
        this.files = files;
        this.clock = clock;
        this.aiHistory = aiHistory;
        this.inputs = inputs;
    }

    /** Exposes process readiness and whether paid OpenAI generation is actually configured. */
    public Map<String, Object> health() {
        return Map.of("status", "ok", "openai_enabled", generator.enabled(), "engine", "java");
    }

    /** Returns the template catalog consumed by the template-selection UI. */
    public Map<String, Object> catalog() {
        return Map.of("items", templates.catalogs());
    }

    /** Returns the curated AI model catalog and defaults accepted by generation endpoints. */
    public Map<String, Object> models() {
        return models.catalog();
    }

    /**
     * Returns the exact field and slide contract for manual clients and prompt inspection.
     * Resolving the template first also turns an unknown id into the normal public error.
     */
    public Map<String, Object> context(String templateId) {
        checkTemplate(templateId);
        return Map.of(
                "fields",
                templates.fields(templateId),
                "slides",
                templates.slideManifest(templateId),
                "template_description",
                templates.description(templateId));
    }

    /** Uses the same reviewed source snapshot as generation without invoking the provider. */
    public Map<String, Object> previewPrompt(
            String templateId,
            String topic,
            String model,
            String goal,
            String audience,
            SourceMaterial source) {
        checkTemplate(templateId);
        checkTopic(topic);
        GenerationInput input = GenerationInput.normalize(goal, audience, source);
        if (input == null)
            return generator.preview(
                    templates.withDescription(templateId, topic.strip()),
                    templates.fields(templateId),
                    templates.slideManifest(templateId),
                    models.resolve(model));
        return generator.preview(
                templates.withDescription(templateId, topic.strip()),
                templates.fields(templateId),
                templates.slideManifest(templateId),
                models.resolve(model),
                input);
    }

    /**
     * Creates a presentation aggregate after validating mode, model, quotas, and idempotency.
     *
     * <p>OpenAI jobs enter {@code QUEUED}; manual jobs enter {@code AWAITING_CONTENT}. The method
     * stores only queue metadata and returns quickly so expensive generation remains asynchronous.
     * A repeated idempotency key returns the original aggregate only when the normalized request
     * hash matches.
     */
    @Transactional
    public PresentationView create(
            UUID userId,
            String templateId,
            String topic,
            String mode,
            String key,
            String model,
            String goal,
            String audience,
            SourceMaterial source) {
        String selectedModel = models.resolve(model);
        GenerationMode selectedMode;
        try {
            selectedMode = GenerationMode.valueOf(mode.toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new GenerationException(GenerationError.INVALID_MODE);
        }
        if (selectedMode == GenerationMode.OPENAI && !generator.enabled())
            throw new GenerationException(GenerationError.OPENAI_DISABLED);
        if (key != null && !key.matches(PresentationPolicy.IDEMPOTENCY_KEY_PATTERN))
            throw new GenerationException(GenerationError.INVALID_IDEMPOTENCY_KEY);
        checkTemplate(templateId);
        checkTopic(topic);
        String normalizedTopic = topic.strip();
        GenerationInput input = GenerationInput.normalize(goal, audience, source);
        if (selectedMode == GenerationMode.MANUAL && input != null)
            throw new GenerationException(GenerationError.INVALID_INPUT);
        String inputJson = inputs.encode(input);
        String fingerprint =
                templateId
                        + "\n"
                        + normalizedTopic
                        + "\n"
                        + selectedMode.value()
                        + "\n"
                        + selectedModel;
        // Preserve existing idempotency keys byte-for-byte when the request has no new fields.
        String canonicalInput = inputJson == null ? fingerprint : fingerprint + "\n" + inputJson;
        String hash = Hashing.sha256(canonicalInput);
        if (key != null) {
            var previous = presentations.findByUserIdAndIdempotencyKey(userId, key);
            if (previous.isPresent()) return idempotent(previous.get(), hash);
        }
        if (presentations.countByUserIdAndCreatedAtAfter(
                                userId, clock.instant().minus(PresentationPolicy.QUOTA_WINDOW))
                        >= PresentationPolicy.MAX_GENERATIONS_PER_DAY
                || presentations.countByUserIdAndStatusIn(
                                userId, List.of(AWAITING_CONTENT, DRAFT, QUEUED, RUNNING))
                        >= PresentationPolicy.MAX_ACTIVE_PRESENTATIONS) {
            throw new GenerationException(GenerationError.GENERATION_LIMIT);
        }
        UUID id = UUID.randomUUID();
        presentations.insertIfAbsent(
                id,
                userId,
                templateId,
                normalizedTopic,
                (selectedMode == GenerationMode.MANUAL ? AWAITING_CONTENT : QUEUED).value(),
                selectedMode.value(),
                key,
                hash,
                selectedModel,
                clock.instant(),
                0,
                inputJson);
        return key == null
                ? PresentationView.from(owned(userId, id))
                : idempotent(
                        presentations.findByUserIdAndIdempotencyKey(userId, key).orElseThrow(),
                        hash);
    }

    /**
     * Validates the complete semantic document supplied for a manual presentation and enqueues it.
     * The row is locked so two submissions cannot both transition the same awaiting job.
     */
    @Transactional
    public PresentationView submitManual(UUID userId, UUID id, PresentationContent content) {
        Presentation p =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationService::missing);
        if (p.getMode() != GenerationMode.MANUAL || p.getStatus() != AWAITING_CONTENT)
            throw new GenerationException(GenerationError.MANUAL_CONTENT_CLOSED);
        PresentationContent plan = templates.normalize(p.getTemplateId(), content);
        p.enqueue(codec.encode(plan), clock.instant());
        return PresentationView.from(p);
    }

    /** Lists only the caller's presentations using a bounded offset page. */
    @Transactional(readOnly = true)
    public PresentationPage list(UUID userId, int limit, int offset) {
        int size = Math.clamp(limit, 1, PresentationPolicy.MAX_PAGE_SIZE);
        int start = Math.max(0, offset);
        return new PresentationPage(
                presentations.findByUserId(userId, new OffsetPageRequest(start, size)).stream()
                        .map(PresentationView::from)
                        .toList(),
                presentations.countByUserId(userId),
                size,
                start);
    }

    /** Returns one caller-owned presentation without exposing another tenant's existence. */
    @Transactional(readOnly = true)
    public PresentationView get(UUID userId, UUID id) {
        return PresentationView.from(owned(userId, id));
    }

    /** Resolves the current successful PPTX through the storage containment boundary. */
    @Transactional(readOnly = true)
    public Path download(UUID userId, UUID id) {
        Presentation p = owned(userId, id);
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.FILE_NOT_READY);
        return files.existing(p.getOutputPath());
    }

    /** Resolves one immutable historical PPTX version after ownership verification. */
    @Transactional(readOnly = true)
    public Path downloadVersion(UUID userId, UUID id, int version) {
        owned(userId, id);
        var revision =
                revisions
                        .findByPresentationIdAndUserIdAndVersion(id, userId, version)
                        .orElseThrow(
                                () -> new GenerationException(GenerationError.VERSION_NOT_FOUND));
        return files.existing(revision.getOutputPath());
    }

    /** Cancels only work that has not begun running or rendering. */
    @Transactional
    public PresentationView cancel(UUID userId, UUID id) {
        Presentation p =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationService::missing);
        if (p.getStatus() != QUEUED && p.getStatus() != AWAITING_CONTENT && p.getStatus() != DRAFT)
            throw new GenerationException(GenerationError.CANNOT_CANCEL);
        if (p.getEditId() != null
                && p.getEditStartedAt()
                        .isAfter(clock.instant().minus(PresentationPolicy.EDIT_LEASE_TIMEOUT)))
            throw new GenerationException(GenerationError.EDIT_IN_PROGRESS);
        p.cancel(clock.instant());
        return PresentationView.from(p);
    }

    /** Returns immutable published versions in version order for the history UI. */
    @Transactional(readOnly = true)
    public List<PresentationRevisionView> versions(UUID userId, UUID id) {
        owned(userId, id);
        return revisions.findByPresentationIdAndUserIdOrderByVersion(id, userId).stream()
                .map(PresentationRevisionView::from)
                .toList();
    }

    /**
     * Applies a natural-language edit as a new immutable presentation version.
     *
     * <p>The edit lease captures the current version and prevents concurrent commits. AI receives
     * the published semantic snapshot, while editor-created text and image blocks are copied onto
     * the newly generated field/slide plan. Rendering happens outside a transaction. Publication
     * succeeds only if the lease and base version still match; otherwise the orphan file is
     * removed.
     */
    public ChatReply chat(UUID userId, UUID id, String message, String model) {
        if (!generator.enabled()) throw new GenerationException(GenerationError.CHAT_DISABLED);
        if (message == null
                || message.isBlank()
                || message.length() > PresentationPolicy.MAX_EDIT_MESSAGE_LENGTH)
            throw new GenerationException(GenerationError.INVALID_MESSAGE);
        var edit = transactions.beginEdit(userId, id, model);
        Path output = null;
        try {
            String topic = PresentationPrompts.edit(edit.topic(), edit.contentJson(), message);
            PresentationContent previous =
                    templates.normalize(edit.templateId(), codec.decode(edit.contentJson()));
            PresentationContent generated =
                    templates.normalize(
                            edit.templateId(),
                            generator.generate(
                                    new AiCallContext(id, AiOperation.CHAT),
                                    templates.withDescription(edit.templateId(), topic),
                                    templates.fields(edit.templateId()),
                                    templates.slideManifest(edit.templateId()),
                                    edit.model()));
            PresentationContent content =
                    templates.normalize(
                            edit.templateId(), preserveEditorBlocks(previous, generated));
            output = files.write(id, edit.baseVersion() + 1, edit.templateId(), content);
            PresentationView view =
                    transactions.completeEdit(
                            edit,
                            message,
                            codec.encode(content),
                            output.toString(),
                            content.slideCount());
            return new ChatReply(
                    view.version(), BackendMessages.text("presentation.chat.reply"), view);
        } catch (Exception error) {
            files.discard(output);
            try {
                transactions.releaseEdit(edit);
            } catch (Exception cleanup) {
                log.warn(EDIT_RELEASE_FAILURE_LOG, edit.token());
            }
            if (error instanceof GenerationException known) throw known;
            throw new GenerationException(GenerationError.EDIT_FAILED);
        }
    }

    /** Returns private provider-call history after presentation ownership is established. */
    public List<PresentationAiCallView> aiCalls(UUID userId, UUID id) {
        owned(userId, id);
        return aiHistory.list(id);
    }

    /**
     * Keeps user-created editor shapes when AI rewrites template fields and inclusion decisions.
     * Generated semantic choices win, while per-slide freeform content remains user-owned.
     */
    private static PresentationContent preserveEditorBlocks(
            PresentationContent previous, PresentationContent generated) {
        Map<Integer, PresentationContent.Slide> bySlide = new LinkedHashMap<>();
        for (var slide : previous.slides()) bySlide.put(slide.slide(), slide);
        return new PresentationContent(
                generated.fields(),
                generated.slides().stream()
                        .map(
                                slide ->
                                        new PresentationContent.Slide(
                                                slide.slide(),
                                                slide.include(),
                                                slide.reason(),
                                                slide.hiddenOrFalse(),
                                                bySlide.containsKey(slide.slide())
                                                        ? bySlide.get(slide.slide())
                                                                .textBlocksOrEmpty()
                                                        : List.of(),
                                                bySlide.containsKey(slide.slide())
                                                        ? bySlide.get(slide.slide())
                                                                .imageBlocksOrEmpty()
                                                        : List.of()))
                        .toList());
    }

    /** Centralizes tenant ownership lookup so callers receive one non-enumerating missing error. */
    private Presentation owned(UUID userId, UUID id) {
        return presentations
                .findByIdAndUserId(id, userId)
                .orElseThrow(PresentationService::missing);
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    /** Verifies that an idempotent retry represents the same normalized creation request. */
    private static PresentationView idempotent(Presentation p, String hash) {
        if (!p.getRequestHash().equals(hash))
            throw new GenerationException(GenerationError.IDEMPOTENCY_CONFLICT);
        return PresentationView.from(p);
    }

    private void checkTemplate(String id) {
        templates.fields(id);
    }

    private static void checkTopic(String topic) {
        if (topic == null
                || topic.isBlank()
                || topic.length() > PresentationPolicy.MAX_TOPIC_LENGTH)
            throw new GenerationException(GenerationError.INVALID_TOPIC);
    }
}
