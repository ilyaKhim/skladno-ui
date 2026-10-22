package ru.godeck.presentation;

import static ru.godeck.presentation.PresentationDtos.*;
import static ru.godeck.presentation.PresentationStatus.*;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.persistence.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
class PresentationService {
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

    PresentationService(
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

    Map<String, Object> health() {
        return Map.of("status", "ok", "openai_enabled", generator.enabled(), "engine", "java");
    }

    Map<String, Object> catalog() {
        return Map.of("items", List.of(templates.catalog()));
    }

    Map<String, Object> models() {
        return models.catalog();
    }

    Map<String, Object> context(String templateId) {
        checkTemplate(templateId);
        return Map.of("fields", templates.fields(), "slides", templates.slideManifest());
    }

    Map<String, Object> previewPrompt(String templateId, String topic, String model) {
        checkTemplate(templateId);
        checkTopic(topic);
        return generator.preview(
                topic.strip(),
                templates.fields(),
                templates.slideManifest(),
                models.resolve(model));
    }

    @Transactional
    View create(
            UUID userId, String templateId, String topic, String mode, String key, String model) {
        String selectedModel = models.resolve(model);
        GenerationMode selectedMode;
        try {
            selectedMode = GenerationMode.valueOf(mode.toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new GenerationException(422, "invalid_mode", "Неизвестный способ заполнения.");
        }
        if (selectedMode == GenerationMode.OPENAI && !generator.enabled())
            throw new GenerationException(503, "openai_disabled", "Генерация пока не включена.");
        if (key != null && !key.matches("[A-Za-z0-9_-]{8,100}"))
            throw new GenerationException(
                    422, "invalid_idempotency_key", "Некорректный ключ повторного запроса.");
        checkTemplate(templateId);
        checkTopic(topic);
        String normalizedTopic = topic.strip();
        String hash =
                hash(
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
                                userId, clock.instant().minus(Duration.ofDays(1)))
                        >= 10
                || presentations.countByUserIdAndStatusIn(
                                userId, List.of(AWAITING_CONTENT, QUEUED, RUNNING))
                        >= 3) {
            throw new GenerationException(
                    429, "generation_limit", "Достигнут лимит генерации. Попробуйте позже.");
        }
        UUID id = UUID.randomUUID();
        presentations.insertIfAbsent(
                id,
                userId,
                templateId,
                normalizedTopic,
                selectedMode == GenerationMode.MANUAL ? "awaiting_content" : "queued",
                selectedMode.value(),
                key,
                hash,
                selectedModel,
                clock.instant());
        return key == null
                ? View.from(owned(userId, id))
                : idempotent(
                        presentations.findByUserIdAndIdempotencyKey(userId, key).orElseThrow(),
                        hash);
    }

    @Transactional
    View submitManual(UUID userId, UUID id, PresentationContent content) {
        PresentationContent plan = templates.normalize(content);
        Presentation p =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationService::missing);
        if (p.getMode() != GenerationMode.MANUAL || p.getStatus() != AWAITING_CONTENT)
            throw new GenerationException(
                    409, "manual_content_closed", "Эта презентация уже отправлена в работу.");
        p.enqueue(codec.encode(plan), clock.instant());
        return View.from(p);
    }

    @Transactional(readOnly = true)
    Page list(UUID userId, int limit, int offset) {
        int size = Math.clamp(limit, 1, 100);
        int start = Math.max(0, offset);
        return new Page(
                presentations.findByUserId(userId, new OffsetPageRequest(start, size)).stream()
                        .map(View::from)
                        .toList(),
                presentations.countByUserId(userId),
                size,
                start);
    }

    @Transactional(readOnly = true)
    View get(UUID userId, UUID id) {
        return View.from(owned(userId, id));
    }

    @Transactional(readOnly = true)
    Path download(UUID userId, UUID id) {
        Presentation p = owned(userId, id);
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(404, "presentation_not_ready", "Готовый файл не найден.");
        return files.existing(p.getOutputPath());
    }

    @Transactional
    View cancel(UUID userId, UUID id) {
        Presentation p =
                presentations.findForUpdate(id, userId).orElseThrow(PresentationService::missing);
        if (p.getStatus() != QUEUED && p.getStatus() != AWAITING_CONTENT)
            throw new GenerationException(409, "cannot_cancel", "Эту задачу уже нельзя отменить.");
        p.cancel(clock.instant());
        return View.from(p);
    }

    @Transactional(readOnly = true)
    List<Revision> versions(UUID userId, UUID id) {
        owned(userId, id);
        return revisions.findByPresentationIdAndUserIdOrderByVersion(id, userId).stream()
                .map(Revision::from)
                .toList();
    }

    ChatReply chat(UUID userId, UUID id, String message, String model) {
        if (!generator.enabled())
            throw new GenerationException(
                    503, "openai_disabled", "Чат-редактирование требует настроенного OpenAI API.");
        if (message == null || message.isBlank() || message.length() > 4000)
            throw new GenerationException(
                    422, "invalid_message", "Введите запрос до 4 000 символов.");
        var edit = transactions.beginEdit(userId, id, model);
        Path output = null;
        try {
            String topic =
                    edit.topic()
                            + "\n\nТекущие материалы: "
                            + edit.contentJson()
                            + "\n\n"
                            + "Измени только то, что необходимо для пожелания пользователя; сохрани"
                            + " остальные тексты и выбор слайдов. Пожелание к редактуре: "
                            + message;
            PresentationContent content =
                    templates.normalize(
                            generator.generate(
                                    topic,
                                    templates.fields(),
                                    templates.slideManifest(),
                                    edit.model()));
            output = files.write(id, edit.baseVersion() + 1, content);
            View view =
                    transactions.completeEdit(
                            edit,
                            message,
                            codec.encode(content),
                            output.toString(),
                            content.slideCount());
            return new ChatReply(
                    view.version(),
                    "Обновил содержание и пересобрал презентацию по вашему запросу.",
                    view);
        } catch (Exception error) {
            files.discard(output);
            try {
                transactions.releaseEdit(edit);
            } catch (Exception cleanup) {
                log.warn("Could not release edit {}", edit.token());
            }
            if (error instanceof GenerationException known) throw known;
            throw new GenerationException(
                    502,
                    "edit_failed",
                    "Не удалось применить правку. Попробуйте сформулировать её иначе.");
        }
    }

    private Presentation owned(UUID userId, UUID id) {
        return presentations
                .findByIdAndUserId(id, userId)
                .orElseThrow(PresentationService::missing);
    }

    private static GenerationException missing() {
        return new GenerationException(404, "presentation_not_found", "Презентация не найдена.");
    }

    private static View idempotent(Presentation p, String hash) {
        if (!p.getRequestHash().equals(hash))
            throw new GenerationException(
                    409, "idempotency_conflict", "Этот ключ уже использован для другого запроса.");
        return View.from(p);
    }

    private static void checkTemplate(String id) {
        if (!PresentationTemplateService.TEMPLATE_ID.equals(id))
            throw new GenerationException(404, "template_not_found", "Шаблон не найден.");
    }

    private static void checkTopic(String topic) {
        if (topic == null || topic.isBlank() || topic.length() > 12000)
            throw new GenerationException(
                    422, "invalid_topic", "Добавьте тему длиной до 12 000 символов.");
    }

    private static String hash(String value) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
