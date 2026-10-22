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

@Service
public class PresentationAiCallHistory {
    private static final Logger log = LoggerFactory.getLogger(PresentationAiCallHistory.class);
    private final PresentationAiCallRepository calls;
    private final Clock clock;

    public PresentationAiCallHistory(PresentationAiCallRepository calls, Clock clock) {
        this.calls = calls;
        this.clock = clock;
    }

    // Short independent transactions: no database connection is held during the provider request.
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

    @Transactional(readOnly = true)
    public List<PresentationAiCallView> list(UUID presentationId) {
        return calls.findByPresentationIdOrderByStartedAtDesc(presentationId).stream()
                .map(PresentationAiCallView::from)
                .toList();
    }
}
