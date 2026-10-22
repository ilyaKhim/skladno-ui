package ru.godeck.presentation.persistence;

import jakarta.persistence.*;

import ru.godeck.presentation.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "generated_presentations")
public class Presentation {
    @Id private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "template_id", nullable = false, length = 64)
    private String templateId;

    @Column(nullable = false, columnDefinition = "text")
    private String topic;

    @Column(nullable = false, length = 24)
    private PresentationStatus status;

    @Column(nullable = false, length = 16)
    private GenerationMode mode;

    @Column(name = "error_code", length = 80)
    private String errorCode;

    @Column(name = "slide_count")
    private Integer slideCount;

    @Column(name = "output_path", columnDefinition = "text")
    private String outputPath;

    @Column(name = "content_json", columnDefinition = "text")
    private String contentJson;

    @Column(name = "idempotency_key", length = 100)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(length = 100)
    private String model;

    @Column(name = "current_version", nullable = false)
    private int currentVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "edit_id")
    private UUID editId;

    @Column(name = "edit_started_at")
    private Instant editStartedAt;

    protected Presentation() {}

    public void enqueue(String contentJson, Instant now) {
        this.contentJson = contentJson;
        status = PresentationStatus.QUEUED;
        updatedAt = now;
    }

    public void start(Instant now) {
        status = PresentationStatus.RUNNING;
        updatedAt = now;
    }

    public void fail(String code, Instant now) {
        status = PresentationStatus.FAILED;
        errorCode = code;
        updatedAt = now;
    }

    public void cancel(Instant now) {
        status = PresentationStatus.CANCELLED;
        updatedAt = now;
    }

    public void succeed(
            String contentJson,
            String path,
            int slideCount,
            String model,
            int version,
            Instant now) {
        this.contentJson = contentJson;
        outputPath = path;
        this.slideCount = slideCount;
        this.model = model;
        currentVersion = version;
        status = PresentationStatus.SUCCEEDED;
        errorCode = null;
        updatedAt = now;
    }

    public void beginEdit(UUID token, Instant now) {
        editId = token;
        editStartedAt = now;
    }

    public void clearEdit() {
        editId = null;
        editStartedAt = null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTemplateId() {
        return templateId;
    }

    public String getTopic() {
        return topic;
    }

    public PresentationStatus getStatus() {
        return status;
    }

    public GenerationMode getMode() {
        return mode;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Integer getSlideCount() {
        return slideCount;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public String getContentJson() {
        return contentJson;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public String getModel() {
        return model;
    }

    public int getCurrentVersion() {
        return currentVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getEditId() {
        return editId;
    }

    public Instant getEditStartedAt() {
        return editStartedAt;
    }
}
