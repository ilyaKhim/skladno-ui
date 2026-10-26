package ru.godeck.presentation.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.dto.PresentationAiCallView;
import ru.godeck.presentation.entity.PresentationAiCall;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.repository.PresentationAiCallRepository;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * Persists an audit trail for paid AI calls independently of presentation transactions.
 *
 * <p>Each boundary uses {@code REQUIRES_NEW}, so no database connection or row lock remains open
 * during provider I/O. Stored bodies are expected to be redacted by the caller; this service owns
 * timing, outcome recording, and retrieval order.
 */
@Service
public class PresentationAiCallHistory {
    private static final Logger log = LoggerFactory.getLogger(PresentationAiCallHistory.class);
    private final PresentationAiCallRepository calls;
    private final Clock clock;

    public PresentationAiCallHistory(PresentationAiCallRepository calls, Clock clock) {
        this.calls = calls;
        this.clock = clock;
    }

    /**
     * Creates and flushes a call record before provider I/O begins.
     *
     * <p>Flushing proves that auditing is available before the application spends tokens and gives
     * the caller a durable correlation id for logs and the eventual response.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UUID start(AiCallContext context, String model, String requestBody) {
        var call =
                calls.saveAndFlush(
                        new PresentationAiCall(context, model, requestBody, clock.instant()));
        log.info(
                "AI request started: call={} presentation={} operation={} model={}",
                call.getId(),
                context.presentationId(),
                context.operation(),
                model);
        return call.getId();
    }

    /** Completes a call record with response diagnostics, status, duration, and stable error code. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(UUID id, String responseBody, Integer httpStatus, String errorCode) {
        var call = calls.findById(id).orElseThrow();
        call.complete(responseBody, httpStatus, errorCode, clock.instant());
        log.info(
                "AI request finished: call={} presentation={} operation={} model={} httpStatus={}"
                    + " durationMs={} error={}",
                id,
                call.getPresentationId(),
                call.getOperation(),
                call.getModel(),
                httpStatus,
                call.getDurationMs(),
                errorCode);
    }

    /** Lists the newest provider calls first for one already-authorized presentation. */
    @Transactional(readOnly = true)
    public List<PresentationAiCallView> list(UUID presentationId) {
        return calls.findByPresentationIdOrderByStartedAtDesc(presentationId).stream()
                .map(PresentationAiCallView::from)
                .toList();
    }
}
