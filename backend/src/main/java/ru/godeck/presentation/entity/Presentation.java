package ru.godeck.presentation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import ru.godeck.common.security.Hashing;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.policy.PresentationPolicy;

import java.time.Instant;
import java.util.UUID;

/**
 * Mutable aggregate root for one user-owned presentation.
 *
 * <p>The entity keeps three related but distinct pieces of state:
 *
 * <ul>
 *   <li>generation lifecycle ({@code status}, error, and initial queue data),
 *   <li>the currently published semantic content and PPTX version,
 *   <li>an unpublished editor draft plus a short-lived lease for expensive edits.
 * </ul>
 *
 * <p>State transitions are expressed as domain methods so services do not update partially related
 * columns independently. Immutable historical versions live in {@link PresentationRevision}; this
 * entity only points at the current output.
 */
@Entity
@Table(name = "generated_presentations")
public class Presentation {
    @Id private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(
            name = "template_id",
            nullable = false,
            length = PresentationPolicy.TEMPLATE_ID_MAX_LENGTH)
    private String templateId;

    @Column(nullable = false, columnDefinition = "text")
    private String topic;

    @Column(nullable = false, length = PresentationPolicy.STATUS_MAX_LENGTH)
    private PresentationStatus status;

    @Column(nullable = false, length = PresentationPolicy.MODE_MAX_LENGTH)
    private GenerationMode mode;

    @Column(name = "error_code", length = PresentationPolicy.ERROR_CODE_MAX_LENGTH)
    private String errorCode;

    @Column(name = "slide_count")
    private Integer slideCount;

    @Column(name = "output_path", columnDefinition = "text")
    private String outputPath;

    @Column(name = "content_json", columnDefinition = "text")
    private String contentJson;

    @Column(name = "idempotency_key", length = PresentationPolicy.IDEMPOTENCY_KEY_MAX_LENGTH)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = Hashing.SHA256_HEX_LENGTH)
    private String requestHash;

    @Column(length = PresentationPolicy.MODEL_ID_MAX_LENGTH)
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

    @Column(name = "editor_json", columnDefinition = "text")
    private String editorJson;

    @Column(name = "editor_base_version")
    private Integer editorBaseVersion;

    @Column(name = "editor_revision", nullable = false)
    private long editorRevision;

    @Column(name = "editor_updated_at")
    private Instant editorUpdatedAt;

    protected Presentation() {}

    /**
     * Moves a manual presentation from content collection to the worker queue.
     *
     * @param contentJson validated semantic plan to render
     * @param now transition time
     */
    public void enqueue(String contentJson, Instant now) {
        this.contentJson = contentJson;
        status = PresentationStatus.QUEUED;
        updatedAt = now;
    }

    /** Marks a queue claim as running before slow generation starts outside the transaction. */
    public void start(Instant now) {
        status = PresentationStatus.RUNNING;
        updatedAt = now;
    }

    /** Records a terminal generation error while retaining diagnostic content already stored. */
    public void fail(String code, Instant now) {
        status = PresentationStatus.FAILED;
        errorCode = code;
        updatedAt = now;
    }

    /** Cancels a presentation that has not started rendering yet. */
    public void cancel(Instant now) {
        status = PresentationStatus.CANCELLED;
        updatedAt = now;
    }

    /**
     * Publishes semantic content and a rendered file as the current successful version.
     *
     * <p>Any compatible editor draft is cleared because its base document has just changed. Draft
     * revision monotonicity is handled separately by the caller when needed for ABA protection.
     */
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
        clearEditorDraft();
    }

    /** Installs a random lease token that identifies the only expensive edit allowed to complete. */
    public void beginEdit(UUID token, Instant now) {
        editId = token;
        editStartedAt = now;
    }

    /** Clears the active edit lease after success or token-checked compensation. */
    public void clearEdit() {
        editId = null;
        editStartedAt = null;
    }

    /**
     * Stores a complete editor snapshot with the published version from which it was derived.
     *
     * @param json serialized {@code PresentationEditorDraft}
     * @param baseVersion current published version
     * @param revision next monotonic autosave revision
     * @param now acknowledgement time
     */
    public void saveEditorDraft(String json, int baseVersion, long revision, Instant now) {
        editorJson = json;
        editorBaseVersion = baseVersion;
        editorRevision = revision;
        editorUpdatedAt = now;
        updatedAt = now;
    }

    /** Removes unpublished editor data while intentionally retaining the revision counter. */
    public void clearEditorDraft() {
        editorJson = null;
        editorBaseVersion = null;
        editorUpdatedAt = null;
    }

    /**
     * Advances the draft generation after commit/clear so stale clients cannot reuse an old value.
     */
    public void bumpEditorRevision(Instant now) {
        editorRevision++;
        updatedAt = now;
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

    public String getEditorJson() {
        return editorJson;
    }

    public Integer getEditorBaseVersion() {
        return editorBaseVersion;
    }

    public long getEditorRevision() {
        return editorRevision;
    }
}
