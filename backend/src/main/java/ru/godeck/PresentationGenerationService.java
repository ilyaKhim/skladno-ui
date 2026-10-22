package ru.godeck;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class PresentationGenerationService {
    private final JdbcTemplate jdbc;
    private final PresentationTemplateService templates;
    private final PresentationContentGenerator contentGenerator;
    private final PresentationModelCatalog models;
    private final ObjectMapper mapper;
    private final TransactionTemplate transactions;
    private final Path dataDirectory;
    private final AtomicBoolean working = new AtomicBoolean();

    PresentationGenerationService(JdbcTemplate jdbc, PresentationTemplateService templates,
                                  PresentationContentGenerator contentGenerator,
                                  PresentationModelCatalog models,
                                  ObjectMapper mapper,
                                  PlatformTransactionManager transactionManager,
                                  @Value("${godeck.generation.data-dir:./data/presentations}") String dataDirectory) {
        this.jdbc = jdbc;
        this.templates = templates;
        this.contentGenerator = contentGenerator;
        this.models = models;
        this.mapper = mapper;
        this.transactions = new TransactionTemplate(transactionManager);
        this.dataDirectory = Path.of(dataDirectory).toAbsolutePath().normalize();
    }

    Map<String, Object> health() {
        return Map.of("status", "ok", "openai_enabled", contentGenerator.enabled(), "engine", "java");
    }

    Map<String, Object> catalog() { return Map.of("items", List.of(templates.catalog())); }

    Map<String, Object> models() { return models.catalog(); }

    Map<String, Object> context(String templateId) {
        if (!PresentationTemplateService.TEMPLATE_ID.equals(templateId)) throw new GenerationException(404, "template_not_found", "Шаблон не найден.");
        return Map.of("fields", templates.fields(), "slides", templates.slideManifest());
    }

    Map<String, Object> previewPrompt(String templateId, String topic, String model) {
        if (!PresentationTemplateService.TEMPLATE_ID.equals(templateId)) throw new GenerationException(404, "template_not_found", "Шаблон не найден.");
        if (topic == null || topic.isBlank() || topic.length() > 12000) throw new GenerationException(422, "invalid_topic", "Добавьте тему длиной до 12 000 символов.");
        return contentGenerator.preview(topic.strip(), templates.fields(), templates.slideManifest(), models.resolve(model));
    }

    @Transactional
    Map<String, Object> create(UUID userId, String templateId, String topic, String mode, String idempotencyKey, String model) {
        String selectedModel = models.resolve(model);
        if (!"manual".equals(mode) && !"openai".equals(mode)) throw new GenerationException(422, "invalid_mode", "Неизвестный способ заполнения.");
        String selectedMode = mode;
        if ("openai".equals(selectedMode) && !contentGenerator.enabled()) throw new GenerationException(503, "openai_disabled", "Генерация пока не включена.");
        if (idempotencyKey != null && !idempotencyKey.matches("[A-Za-z0-9_-]{8,100}")) {
            throw new GenerationException(422, "invalid_idempotency_key", "Некорректный ключ повторного запроса.");
        }
        if (!PresentationTemplateService.TEMPLATE_ID.equals(templateId)) {
            throw new GenerationException(404, "template_not_found", "Шаблон не найден.");
        }
        if (topic == null || topic.isBlank() || topic.length() > 12000) {
            throw new GenerationException(422, "invalid_topic", "Добавьте тему длиной до 12 000 символов.");
        }
        String normalizedTopic = topic.strip();
        String requestHash = hash(templateId + "\n" + normalizedTopic + "\n" + selectedMode + "\n" + selectedModel);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            var previous = jdbc.query("SELECT * FROM generated_presentations WHERE user_id=? AND idempotency_key=?",
                    (rs, row) -> toPublic(rs), userId, idempotencyKey);
            if (!previous.isEmpty()) {
                Map<String, Object> existing = previous.getFirst();
                if (!requestHash.equals(existing.get("request_hash"))) {
                    throw new GenerationException(409, "idempotency_conflict", "Этот ключ уже использован для другого запроса.");
                }
                return withoutPrivateFields(existing);
            }
        }
        long count = jdbc.queryForObject("SELECT count(*) FROM generated_presentations WHERE user_id=? AND created_at > now() - interval '1 day'",
                Long.class, userId);
        long active = jdbc.queryForObject("SELECT count(*) FROM generated_presentations WHERE user_id=? AND status IN ('awaiting_content','queued','running')",
                Long.class, userId);
        if (count >= 10 || active >= 3) throw new GenerationException(429, "generation_limit", "Достигнут лимит генерации. Попробуйте позже.");

        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO generated_presentations
                    (id,user_id,template_id,topic,status,mode,idempotency_key,request_hash,model,created_at,updated_at)
                VALUES (?,?,?,?, ?,?,?,?,?,now(),now())
                ON CONFLICT (user_id,idempotency_key) DO NOTHING
                """, id, userId, templateId, normalizedTopic, "manual".equals(selectedMode) ? "awaiting_content" : "queued", selectedMode, idempotencyKey, requestHash, selectedModel);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            return jdbc.queryForObject("SELECT * FROM generated_presentations WHERE user_id=? AND idempotency_key=?",
                    (rs, row) -> {
                        Map<String, Object> existing = toPublic(rs);
                        if (!requestHash.equals(existing.get("request_hash"))) {
                            throw new GenerationException(409, "idempotency_conflict", "Этот ключ уже использован для другого запроса.");
                        }
                        return withoutPrivateFields(existing);
                    }, userId, idempotencyKey);
        }
        return get(userId, id);
    }

    @Transactional
    Map<String, Object> submitManual(UUID userId, UUID id, Map<String, Object> content) {
        content = validateContent(content);
        String json;
        try { json = mapper.writeValueAsString(content); } catch (Exception e) { throw new IllegalArgumentException(e); }
        int changed = jdbc.update("UPDATE generated_presentations SET content_json=?,status='queued',updated_at=now() WHERE user_id=? AND id=? AND mode='manual' AND status='awaiting_content'", json, userId, id);
        if (changed == 0) throw new GenerationException(409, "manual_content_closed", "Эта презентация уже отправлена в работу.");
        return get(userId, id);
    }

    @Transactional
    @SuppressWarnings("unchecked")
    Map<String, Object> chat(UUID userId, UUID id, String message, String model) {
        if (!contentGenerator.enabled()) throw new GenerationException(503, "openai_disabled", "Чат-редактирование требует настроенного OpenAI API.");
        if (message == null || message.isBlank() || message.length() > 4000) throw new GenerationException(422, "invalid_message", "Введите запрос до 4 000 символов.");
        Map<String, Object> presentation;
        try {
            presentation = jdbc.query("SELECT * FROM generated_presentations WHERE user_id=? AND id=? AND status='succeeded' FOR UPDATE NOWAIT", (rs, row) -> toPublic(rs), userId, id).stream().findFirst().orElseThrow(() -> new GenerationException(409, "presentation_not_ready", "Чат доступен после создания презентации."));
        } catch (DataAccessException e) {
            if (e.getMostSpecificCause() instanceof java.sql.SQLException sql && "55P03".equals(sql.getSQLState())) {
                throw new GenerationException(409, "edit_in_progress", "Дождитесь завершения предыдущей правки.");
            }
            throw e;
        }
        Long edits = jdbc.queryForObject("SELECT count(*) FROM presentation_revisions WHERE user_id=? AND version > 1 AND created_at > now() - interval '1 day'", Long.class, userId);
        if (edits != null && edits >= 30) throw new GenerationException(429, "edit_limit", "Достигнут дневной лимит правок.");
        String selectedModel = models.resolve(model == null || model.isBlank() ? (String) presentation.get("model") : model);
        Path output = null;
        try {
            String raw = jdbc.queryForObject("SELECT content_json FROM generated_presentations WHERE user_id=? AND id=?", String.class, userId, id);
            if (raw == null) throw new GenerationException(409, "content_unavailable", "Для этой старой презентации не сохранён план. Создайте новую презентацию.");
            String topic = presentation.get("topic") + "\n\nТекущие материалы: " + raw + "\n\nИзмени только то, что необходимо для пожелания пользователя; сохрани остальные тексты и выбор слайдов. Пожелание к редактуре: " + message;
            Map<String, Object> edited = validateContent(contentGenerator.generate(topic, templates.fields(), templates.slideManifest(), selectedModel));
            int version = ((Number) presentation.get("version")).intValue() + 1;
            String json = mapper.writeValueAsString(edited);
            output = writePresentation(id, version, edited);
            int count = ((List<Map<String, Object>>) edited.get("slides")).stream().filter(s -> Boolean.TRUE.equals(s.get("include"))).toList().size();
            jdbc.update("INSERT INTO presentation_revisions(id,presentation_id,user_id,version,message,reply,content_json,output_path,slide_count,model) VALUES (?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID(), id, userId, version, message.strip(), "Обновил содержание и пересобрал презентацию по вашему запросу.", json, output.toString(), count, selectedModel);
            jdbc.update("UPDATE generated_presentations SET content_json=?,current_version=?,output_path=?,slide_count=?,model=?,updated_at=now() WHERE id=?", json, version, output.toString(), count, selectedModel, id);
            return Map.of("version", version, "reply", "Обновил содержание и пересобрал презентацию по вашему запросу.", "presentation", get(userId, id));
        } catch (GenerationException e) { deleteOutput(output); throw e; }
        catch (Exception e) { deleteOutput(output); throw new GenerationException(502, "edit_failed", "Не удалось применить правку. Попробуйте сформулировать её иначе."); }
    }

    List<Map<String, Object>> versions(UUID userId, UUID id) {
        get(userId, id);
        return jdbc.query("SELECT version,message,reply,slide_count,model,created_at FROM presentation_revisions WHERE user_id=? AND presentation_id=? ORDER BY version", (rs, row) -> Map.of("version",rs.getInt("version"),"message",rs.getString("message"),"reply",rs.getString("reply"),"slide_count",rs.getInt("slide_count"),"model",rs.getString("model") == null ? "" : rs.getString("model"),"created_at",rs.getTimestamp("created_at").toInstant().getEpochSecond()), userId, id);
    }

    @SuppressWarnings("unchecked")
    private Map<String,Object> validateContent(Map<String, Object> content) {
        if (!(content.get("fields") instanceof Map<?, ?> rawFields) || !(content.get("slides") instanceof List<?> rawSlides)) throw new GenerationException(422,"invalid_content","Заполните поля и выберите слайды.");
        if (!rawFields.keySet().equals(templates.fields().keySet())) throw new GenerationException(422,"invalid_fields","Поля формы не совпадают с шаблоном.");
        Map<String,String> values = new LinkedHashMap<>();
        rawFields.forEach((key,value) -> { if (!(key instanceof String k) || !(value instanceof String v)) throw new GenerationException(422,"invalid_fields","Все поля должны содержать текст."); values.put(k,v); });
        if (rawSlides.size() != templates.slideManifest().size()) throw new GenerationException(422,"invalid_slides","Передайте решение для каждого слайда.");
        try {
            Map<String,String> normalized = templates.normalizeValues(values);
            templates.render(normalized,(List<Map<String,Object>>) rawSlides);
            return Map.of("fields", normalized, "slides", rawSlides);
        }
        catch (Exception e) { throw new GenerationException(422,"invalid_content","Проверьте заполнение и выберите хотя бы один слайд."); }
    }

    Map<String, Object> list(UUID userId, int limit, int offset) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        int safeOffset = Math.max(0, offset);
        List<Map<String, Object>> items = jdbc.query("SELECT * FROM generated_presentations WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                (rs, row) -> withoutPrivateFields(toPublic(rs)), userId, safeLimit, safeOffset);
        Integer total = jdbc.queryForObject("SELECT count(*) FROM generated_presentations WHERE user_id=?", Integer.class, userId);
        return Map.of("items", items, "total", total == null ? 0 : total, "limit", safeLimit, "offset", safeOffset);
    }

    Map<String, Object> get(UUID userId, UUID id) {
        return withoutPrivateFields(jdbc.query("SELECT * FROM generated_presentations WHERE user_id=? AND id=?",
                (rs, row) -> toPublic(rs), userId, id).stream().findFirst()
                .orElseThrow(() -> new GenerationException(404, "presentation_not_found", "Презентация не найдена.")));
    }

    Path download(UUID userId, UUID id) {
        String path = jdbc.query("SELECT output_path FROM generated_presentations WHERE user_id=? AND id=? AND status='succeeded'",
                rs -> rs.next() ? rs.getString(1) : null, userId, id);
        if (path == null) throw new GenerationException(404, "presentation_not_ready", "Готовый файл не найден.");
        Path file = Path.of(path).normalize();
        if (!file.startsWith(dataDirectory) || !Files.isRegularFile(file)) {
            throw new GenerationException(404, "presentation_not_ready", "Готовый файл не найден.");
        }
        return file;
    }

    Map<String, Object> cancel(UUID userId, UUID id) {
        int changed = jdbc.update("UPDATE generated_presentations SET status='cancelled',updated_at=now() WHERE user_id=? AND id=? AND status IN ('queued','awaiting_content')", userId, id);
        if (changed == 0) throw new GenerationException(409, "cannot_cancel", "Эту задачу уже нельзя отменить.");
        return get(userId, id);
    }

    @Scheduled(initialDelayString = "${godeck.generation.poll-ms:1500}", fixedDelayString = "${godeck.generation.poll-ms:1500}")
    void processOne() {
        if (!working.compareAndSet(false, true)) return;
        try {
            Map<String, Object> job = claim();
            if (job != null) process(job);
        } catch (Exception ignored) {
            // A later scheduler tick can safely continue after transient DB or worker errors.
        } finally {
            working.set(false);
        }
    }

    private Map<String, Object> claim() {
        jdbc.update("UPDATE generated_presentations SET status='failed',error_code='worker_interrupted',updated_at=now() " +
                "WHERE status='running' AND updated_at < now() - interval '5 minutes'");
        List<Map<String, Object>> rows = jdbc.query("""
                UPDATE generated_presentations SET status='running',updated_at=now()
                WHERE id=(SELECT id FROM generated_presentations WHERE status='queued'
                         ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
                RETURNING id,user_id,template_id,topic,mode,content_json,model
                """, (rs, row) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", rs.getObject("id", UUID.class));
            item.put("user_id", rs.getObject("user_id", UUID.class));
            item.put("template_id", rs.getString("template_id"));
            item.put("topic", rs.getString("topic"));
            item.put("mode", rs.getString("mode"));
            item.put("content_json", rs.getString("content_json"));
            item.put("model", rs.getString("model"));
            return item;
        });
        return rows.stream().findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private void process(Map<String, Object> job) {
        UUID id = (UUID) job.get("id");
        Path output = null;
        try {
            String selectedModel = models.resolve((String) job.get("model"));
            Map<String, Object> content = "manual".equals(job.get("mode"))
                    ? mapper.readValue((String) job.get("content_json"), mapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class))
                    : contentGenerator.generate((String) job.get("topic"), templates.fields(), templates.slideManifest(), selectedModel);
            content = validateContent(content);
            List<Map<String, Object>> slideDecisions = (List<Map<String, Object>>) content.get("slides");
            output = writePresentation(id, 1, content);
            String outputPath = output.toString();
            int count = slideDecisions.stream().filter(s -> Boolean.TRUE.equals(s.get("include"))).toList().size();
            String json = mapper.writeValueAsString(content);
            transactions.executeWithoutResult(transaction -> {
                int changed = jdbc.update("UPDATE generated_presentations SET status='succeeded',slide_count=?,output_path=?,content_json=?,model=?,current_version=1,updated_at=now() WHERE id=? AND status='running'", count, outputPath, json, selectedModel, id);
                if (changed != 1) throw new IllegalStateException("worker_interrupted");
                jdbc.update("INSERT INTO presentation_revisions(id,presentation_id,user_id,version,message,reply,content_json,output_path,slide_count,model) SELECT ?,id,user_id,1,?, ?,?,?,?,? FROM generated_presentations WHERE id=?", UUID.randomUUID(), "Исходная версия", "Презентация создана.", json, outputPath, count, "manual".equals(job.get("mode")) ? null : selectedModel, id);
            });
        } catch (Exception error) {
            deleteOutput(output);
            String code = error instanceof IllegalStateException state && "openai_disabled".equals(state.getMessage())
                    ? "openai_disabled" : "generation_failed";
            jdbc.update("UPDATE generated_presentations SET status='failed',error_code=?,updated_at=now() WHERE id=? AND status='running'", code, id);
        }
    }

    @SuppressWarnings("unchecked")
    private Path writePresentation(UUID id, int version, Map<String,Object> content) throws Exception {
        Files.createDirectories(dataDirectory);
        Path output = dataDirectory.resolve(id + "-v" + version + "-" + UUID.randomUUID() + ".pptx");
        Path temp = Files.createTempFile(dataDirectory, id.toString(), ".tmp");
        try {
            Files.write(temp, templates.render((Map<String,String>) content.get("fields"), (List<Map<String,Object>>) content.get("slides")));
            Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE);
            return output;
        } finally { Files.deleteIfExists(temp); }
    }

    private static void deleteOutput(Path output) {
        if (output != null) try { Files.deleteIfExists(output); } catch (java.io.IOException ignored) { /* No database reference points to this failed output. */ }
    }

    private static Map<String, Object> toPublic(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", rs.getObject("id", UUID.class).toString());
        item.put("template_id", rs.getString("template_id"));
        item.put("topic", rs.getString("topic"));
        item.put("mode", rs.getString("mode"));
        item.put("model", rs.getString("model"));
        item.put("status", rs.getString("status"));
        item.put("created_at", rs.getTimestamp("created_at").toInstant().getEpochSecond());
        item.put("updated_at", rs.getTimestamp("updated_at").toInstant().getEpochSecond());
        item.put("error_code", rs.getString("error_code"));
        item.put("slide_count", (Object) rs.getObject("slide_count"));
        item.put("version", rs.getInt("current_version"));
        item.put("download_url", "succeeded".equals(rs.getString("status"))
                ? "/api/generation/v1/presentations/" + rs.getObject("id", UUID.class) + "/download" : null);
        item.put("request_hash", rs.getString("request_hash"));
        item.put("output_path", rs.getString("output_path"));
        item.put("idempotency_key", rs.getString("idempotency_key"));
        return item;
    }

    private static Map<String, Object> withoutPrivateFields(Map<String, Object> item) {
        item.remove("request_hash"); item.remove("output_path"); item.remove("idempotency_key");
        return item;
    }

    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    static class GenerationException extends RuntimeException {
        private final int status;
        private final String code;
        GenerationException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
        int status() { return status; }
        String code() { return code; }
    }
}
