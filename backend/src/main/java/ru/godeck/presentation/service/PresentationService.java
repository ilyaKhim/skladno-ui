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
import ru.godeck.presentation.dto.PresentationPage;
import ru.godeck.presentation.dto.PresentationRevisionView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.repository.OffsetPageRequest;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.repository.PresentationRevisionRepository;
import ru.godeck.presentation.storage.PresentationFiles;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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

    public PresentationService(
            PresentationRepository presentations,
            PresentationRevisionRepository revisions,
            PresentationTransactions transactions,
            PresentationTemplateService templates,
            PresentationContentGenerator generator,
            PresentationModelCatalog models,
            PresentationContentCodec codec,
            PresentationFiles files,
            Clock clock) {
        this.presentations = presentations;
        this.revisions = revisions;
        this.transactions = transactions;
        this.templates = templates;
        this.generator = generator;
        this.models = models;
        this.codec = codec;
        this.files = files;
        this.clock = clock;
    }

    public Map<String, Object> health() {
        return Map.of("status", "ok", "openai_enabled", generator.enabled(), "engine", "java");
    }

    public Map<String, Object> catalog() {
        return Map.of("items", templates.catalogs());
    }

    public Map<String, Object> models() {
        return models.catalog();
    }

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

    public Map<String, Object> previewPrompt(String templateId, String topic, String model) {
        checkTemplate(templateId);
        checkTopic(topic);
        return generator.preview(
                templates.withDescription(templateId, topic.strip()),
                templates.fields(templateId),
                templates.slideManifest(templateId),
                models.resolve(model));
    }

    @Transactional
    public PresentationView create(
            UUID userId, String templateId, String topic, String mode, String key, String model) {
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
        String hash =
                Hashing.sha256(
                        templateId
                                + "\n"
                                + normalizedTopic
                                + "\n"
                                + selectedMode.value()
                                + "\n"
                                + selectedModel);
        if (key != null) {
            var previous = presentations.findByUserIdAndIdempotencyKey(userId, key);
            if (previous.isPresent()) return idempotent(previous.get(), hash);
        }
        if (presentations.countByUserIdAndCreatedAtAfter(
                                userId, clock.instant().minus(PresentationPolicy.QUOTA_WINDOW))
                        >= PresentationPolicy.MAX_GENERATIONS_PER_DAY
                || presentations.countByUserIdAndStatusIn(
                                userId, List.of(AWAITING_CONTENT, QUEUED, RUNNING))
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
                PresentationPolicy.INITIAL_VERSION);
        return key == null
                ? PresentationView.from(owned(userId, id))
                : idempotent(
                        presentations.findByUserIdAndIdempotencyKey(userId, key).orElseThrow(),
                        hash);
    }

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

    @Transactional(readOnly = true)
    public PresentationView get(UUID userId, UUID id) {
        return PresentationView.from(owned(userId, id));
    }

    @Transactional(readOnly = true)
    public Path download(UUID userId, UUID id) {
        Presentation p = owned(userId, id);
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.FILE_NOT_READY);
        return files.existing(p.getOutputPath());
    }

    @Transactional
    public PresentationView cancel(UUID userId, UUID id) {
        Presentation p =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationService::missing);
        if (p.getStatus() != QUEUED && p.getStatus() != AWAITING_CONTENT)
            throw new GenerationException(GenerationError.CANNOT_CANCEL);
        p.cancel(clock.instant());
        return PresentationView.from(p);
    }

    @Transactional(readOnly = true)
    public List<PresentationRevisionView> versions(UUID userId, UUID id) {
        owned(userId, id);
        return revisions.findByPresentationIdAndUserIdOrderByVersion(id, userId).stream()
                .map(PresentationRevisionView::from)
                .toList();
    }

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
            PresentationContent content =
                    templates.normalize(
                            edit.templateId(),
                            generator.generate(
                                    templates.withDescription(edit.templateId(), topic),
                                    templates.fields(edit.templateId()),
                                    templates.slideManifest(edit.templateId()),
                                    edit.model()));
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

    private Presentation owned(UUID userId, UUID id) {
        return presentations
                .findByIdAndUserId(id, userId)
                .orElseThrow(PresentationService::missing);
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

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
