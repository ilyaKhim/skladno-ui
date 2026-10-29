package ru.godeck.presentation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.policy.PresentationPolicy;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "presentation_ai_calls")
public class PresentationAiCall {
    @Id private UUID id;

    @Column(name = "presentation_id", nullable = false)
    private UUID presentationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = PresentationPolicy.MODE_MAX_LENGTH)
    private AiOperation operation;

    @Column(nullable = false, length = PresentationPolicy.MODEL_ID_MAX_LENGTH)
    private String model;

    @Column(name = "request_body", nullable = false, columnDefinition = "text")
    private String requestBody;

    @Column(name = "response_body", columnDefinition = "text")
    private String responseBody;

    @Column(name = "http_status")
    private Integer httpStatus;

    @Column(name = "error_code", length = PresentationPolicy.ERROR_CODE_MAX_LENGTH)
    private String errorCode;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "cached_input_tokens")
    private Integer cachedInputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "reasoning_tokens")
    private Integer reasoningTokens;

    protected PresentationAiCall() {}

    public PresentationAiCall(
            AiCallContext context, String model, String requestBody, Instant startedAt) {
        this.id = UUID.randomUUID();
        this.presentationId = context.presentationId();
        this.operation = context.operation();
        this.model = model;
        this.requestBody = requestBody;
        this.startedAt = startedAt;
    }

    public void complete(
            String responseBody, Integer httpStatus, String errorCode, Instant completedAt) {
        this.responseBody = responseBody;
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
        this.completedAt = completedAt;
        this.durationMs = Math.max(0, Duration.between(startedAt, completedAt).toMillis());
    }

    /** Stores provider token usage; {@code null} values mean the provider did not report them. */
    public void recordUsage(
            Integer inputTokens,
            Integer cachedInputTokens,
            Integer outputTokens,
            Integer reasoningTokens) {
        this.inputTokens = inputTokens;
        this.cachedInputTokens = cachedInputTokens;
        this.outputTokens = outputTokens;
        this.reasoningTokens = reasoningTokens;
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

    public UUID getId() {
        return id;
    }

    public UUID getPresentationId() {
        return presentationId;
    }

    public AiOperation getOperation() {
        return operation;
    }

    public String getModel() {
        return model;
    }

    public String getRequestBody() {
        return requestBody;
    }

    public String getResponseBody() {
        return responseBody;
    }

    public Integer getHttpStatus() {
        return httpStatus;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Long getDurationMs() {
        return durationMs;
    }
}
