package ru.godeck.presentation.exception;

import org.springframework.http.HttpStatus;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.policy.PresentationPolicy;

public enum GenerationError {
    PRESENTATION_BUSY(
            HttpStatus.CONFLICT, "presentation_busy", "presentation.error.presentation-busy"),
    CANNOT_CANCEL(HttpStatus.CONFLICT, "cannot_cancel", "presentation.error.cannot-cancel"),
    CHAT_DISABLED(
            HttpStatus.SERVICE_UNAVAILABLE, "openai_disabled", "presentation.error.chat-disabled"),
    CONTENT_UNAVAILABLE(
            HttpStatus.CONFLICT, "content_unavailable", "presentation.error.content-unavailable"),
    EDIT_EXPIRED(HttpStatus.CONFLICT, "edit_expired", "presentation.error.edit-expired"),
    EDIT_FAILED(HttpStatus.BAD_GATEWAY, "edit_failed", "presentation.error.edit-failed"),
    EDIT_IN_PROGRESS(
            HttpStatus.CONFLICT, "edit_in_progress", "presentation.error.edit-in-progress"),
    EDIT_LIMIT(HttpStatus.TOO_MANY_REQUESTS, "edit_limit", "presentation.error.edit-limit"),
    FILE_NOT_READY(
            HttpStatus.NOT_FOUND, "presentation_not_ready", "presentation.error.file-not-ready"),
    GENERATION_EMPTY(
            HttpStatus.BAD_GATEWAY, "generation_empty", "presentation.error.generation-empty"),
    GENERATION_FAILED(
            HttpStatus.BAD_GATEWAY, "generation_failed", "presentation.error.generation-failed"),
    GENERATION_INCOMPLETE(
            HttpStatus.BAD_GATEWAY,
            "generation_incomplete",
            "presentation.error.generation-incomplete"),
    GENERATION_LIMIT(
            HttpStatus.TOO_MANY_REQUESTS,
            "generation_limit",
            "presentation.error.generation-limit"),
    IDEMPOTENCY_CONFLICT(
            HttpStatus.CONFLICT, "idempotency_conflict", "presentation.error.idempotency-conflict"),
    INVALID_CONTENT(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "invalid_content",
            "presentation.error.invalid-content"),
    INVALID_IDEMPOTENCY_KEY(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "invalid_idempotency_key",
            "presentation.error.invalid-idempotency-key"),
    INVALID_INPUT(
            HttpStatus.UNPROCESSABLE_ENTITY, "invalid_input", "presentation.error.invalid-input"),
    INVALID_MESSAGE(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "invalid_message",
            "presentation.error.invalid-message"),
    INVALID_MODE(
            HttpStatus.UNPROCESSABLE_ENTITY, "invalid_mode", "presentation.error.invalid-mode"),
    INVALID_TOPIC(
            HttpStatus.UNPROCESSABLE_ENTITY, "invalid_topic", "presentation.error.invalid-topic"),
    MANUAL_CONTENT_CLOSED(
            HttpStatus.CONFLICT,
            "manual_content_closed",
            "presentation.error.manual-content-closed"),
    OPENAI_DISABLED(
            HttpStatus.SERVICE_UNAVAILABLE,
            "openai_disabled",
            "presentation.error.openai-disabled"),
    PRESENTATION_NOT_FOUND(
            HttpStatus.NOT_FOUND,
            "presentation_not_found",
            "presentation.error.presentation-not-found"),
    PRESENTATION_NOT_READY(
            HttpStatus.CONFLICT,
            "presentation_not_ready",
            "presentation.error.presentation-not-ready"),
    TEMPLATE_NOT_FOUND(
            HttpStatus.NOT_FOUND, "template_not_found", "presentation.error.template-not-found"),
    UNSUPPORTED_MODEL(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "unsupported_model",
            "presentation.error.unsupported-model"),
    VERSION_NOT_FOUND(
            HttpStatus.NOT_FOUND, "version_not_found", "presentation.error.version-not-found"),
    WORKER_INTERRUPTED(
            HttpStatus.CONFLICT, "worker_interrupted", "presentation.error.worker-interrupted");
    private final HttpStatus status;
    private final String code;
    private final String messageKey;

    GenerationError(HttpStatus status, String code, String messageKey) {
        this.status = status;
        this.code = code;
        this.messageKey = messageKey;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public String message() {
        return switch (this) {
            case INVALID_TOPIC ->
                    BackendMessages.text(messageKey, PresentationPolicy.MAX_TOPIC_LENGTH);
            case INVALID_MESSAGE ->
                    BackendMessages.text(messageKey, PresentationPolicy.MAX_EDIT_MESSAGE_LENGTH);
            default -> BackendMessages.text(messageKey);
        };
    }
}
