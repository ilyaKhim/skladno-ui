package ru.godeck.presentation.aiedit.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import org.springframework.data.domain.Persistable;

import ru.godeck.common.security.Hashing;
import ru.godeck.presentation.aiedit.ai.ResponsesUsage;
import ru.godeck.presentation.aiedit.core.AiEditKind;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.aiedit.repository.converter.AiEditStatusConverter;
import ru.godeck.presentation.aiedit.repository.converter.TargetKindConverter;
import ru.godeck.presentation.policy.PresentationPolicy;

import java.time.Instant;
import java.util.UUID;

/**
 * One AI edit in the journal: idempotency key, quota unit, outcome, usage and the replayable
 * response. Stores no presentation document; the edit never changes one.
 *
 * <p>Implements {@link Persistable} so a new row with an assigned id is inserted with {@code
 * persist}: a concurrent request with the same {@code request_id} then fails on the unique key
 * instead of being merged.
 */
@Entity
@Table(name = "presentation_ai_edits")
public class PresentationAiEdit implements Persistable<UUID> {
    @Id private UUID id;

    @Column(name = "presentation_id", nullable = false)
    private UUID presentationId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = AiEditPolicy.KIND_MAX_LENGTH)
    private AiEditKind kind;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "request_hash", nullable = false, length = Hashing.SHA256_HEX_LENGTH)
    private String requestHash;

    @Column(name = "refines_edit_id")
    private UUID refinesEditId;

    @Column(nullable = false, length = AiEditPolicy.ACTION_ID_MAX_LENGTH)
    private String action;

    @Column(name = "params_json", nullable = false, columnDefinition = "text")
    private String paramsJson;

    @Convert(converter = TargetKindConverter.class)
    @Column(name = "target_kind", nullable = false, length = AiEditPolicy.KIND_MAX_LENGTH)
    private TargetKind targetKind;

    @Column(name = "target_ref", nullable = false, length = AiEditPolicy.TARGET_REF_MAX_LENGTH)
    private String targetRef;

    @Column(name = "source_length", nullable = false)
    private int sourceLength;

    @Convert(converter = AiEditStatusConverter.class)
    @Column(nullable = false, length = AiEditPolicy.STATUS_MAX_LENGTH)
    private AiEditStatus status;

    @Column(name = "result_json", columnDefinition = "text")
    private String resultJson;

    @Column(nullable = false, length = PresentationPolicy.MODEL_ID_MAX_LENGTH)
    private String model;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "cached_input_tokens")
    private Integer cachedInputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "reasoning_tokens")
    private Integer reasoningTokens;

    @Column(name = "error_code", length = PresentationPolicy.ERROR_CODE_MAX_LENGTH)
    private String errorCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Transient private boolean persisted;

    protected PresentationAiEdit() {}

    /** Creates a {@code running} text edit; the caller inserts it before calling the model. */
    public PresentationAiEdit(
            UUID presentationId,
            UUID userId,
            UUID requestId,
            String requestHash,
            UUID refinesEditId,
            String action,
            String paramsJson,
            TargetKind targetKind,
            String targetRef,
            int sourceLength,
            String model,
            Instant createdAt) {
        this.id = UUID.randomUUID();
        this.presentationId = presentationId;
        this.userId = userId;
        this.kind = AiEditKind.TEXT_EDIT;
        this.requestId = requestId;
        this.requestHash = requestHash;
        this.refinesEditId = refinesEditId;
        this.action = action;
        this.paramsJson = paramsJson;
        this.targetKind = targetKind;
        this.targetRef = targetRef;
        this.sourceLength = sourceLength;
        this.status = AiEditStatus.RUNNING;
        this.model = model;
        this.createdAt = createdAt;
    }

    /** Stores a successful outcome and the response body replayed for the same request id. */
    public void complete(
            AiEditStatus status, String resultJson, ResponsesUsage usage, Instant completedAt) {
        if (!status.replayable()) throw new IllegalArgumentException(status.value());
        this.status = status;
        this.resultJson = resultJson;
        recordUsage(usage);
        this.completedAt = completedAt;
    }

    /** Marks the edit failed; a retry with the same request id returns the same error. */
    public void fail(String errorCode, ResponsesUsage usage, Instant completedAt) {
        this.status = AiEditStatus.FAILED;
        this.errorCode = errorCode;
        recordUsage(usage);
        this.completedAt = completedAt;
    }

    private void recordUsage(ResponsesUsage usage) {
        if (usage == null) return;
        this.inputTokens = usage.inputTokens();
        this.cachedInputTokens = usage.cachedInputTokens();
        this.outputTokens = usage.outputTokens();
        this.reasoningTokens = usage.reasoningTokens();
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return !persisted;
    }

    @PostLoad
    @PostPersist
    void markPersisted() {
        persisted = true;
    }

    public UUID getPresentationId() {
        return presentationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public AiEditKind getKind() {
        return kind;
    }

    public UUID getRequestId() {
        return requestId;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public UUID getRefinesEditId() {
        return refinesEditId;
    }

    public String getAction() {
        return action;
    }

    public String getParamsJson() {
        return paramsJson;
    }

    public TargetKind getTargetKind() {
        return targetKind;
    }

    public String getTargetRef() {
        return targetRef;
    }

    public int getSourceLength() {
        return sourceLength;
    }

    public AiEditStatus getStatus() {
        return status;
    }

    public String getResultJson() {
        return resultJson;
    }

    public String getModel() {
        return model;
    }

    public Integer getInputTokens() {
        return inputTokens;
    }

    public Integer getCachedInputTokens() {
        return cachedInputTokens;
    }

    public Integer getOutputTokens() {
        return outputTokens;
    }

    public Integer getReasoningTokens() {
        return reasoningTokens;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
