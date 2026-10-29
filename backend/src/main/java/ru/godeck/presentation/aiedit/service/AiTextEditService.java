package ru.godeck.presentation.aiedit.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import ru.godeck.common.security.Hashing;
import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.ai.PresentationModelCatalog;
import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.action.TextEditActionRegistry;
import ru.godeck.presentation.aiedit.ai.ResponsesUsage;
import ru.godeck.presentation.aiedit.ai.TextEditLlm;
import ru.godeck.presentation.aiedit.ai.TextEditOutcome;
import ru.godeck.presentation.aiedit.ai.TextEditPrompt;
import ru.godeck.presentation.aiedit.core.AiEditContext;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.core.AiEditTarget;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.core.TargetResolver;
import ru.godeck.presentation.aiedit.dto.AiActionCatalogView;
import ru.godeck.presentation.aiedit.dto.AiUsageView;
import ru.godeck.presentation.aiedit.dto.TextEditRequest;
import ru.godeck.presentation.aiedit.dto.TextEditTargetDto;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;
import ru.godeck.presentation.aiedit.repository.PresentationAiEditRepository;
import ru.godeck.presentation.aiedit.text.TextResultSanitizer;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Proposes new text for one editor block with a single model call.
 *
 * <ol>
 *   <li>Checks without writes: action and parameters, model, target in the saved document, refined
 *       edit, AI availability.
 *   <li>Short transaction: idempotency, quota and a {@code running} journal row.
 *   <li>One model call without an open transaction, then deterministic sanitizing. Long text is
 *       never truncated and never triggers a second call.
 *   <li>Short transaction: outcome, usage and the replayable response.
 * </ol>
 *
 * <p>The presentation document, its draft, revisions and files are never modified, and the editor
 * lease is not taken, so autosave and export keep working during the call.
 */
@Service
public class AiTextEditService {
    private static final Logger log = LoggerFactory.getLogger(AiTextEditService.class);
    private static final Pattern SLIDE_ID = Pattern.compile("slide-([1-9][0-9]{0,8})");
    private static final String TARGET_LENGTH = " Целевая длина ≤ %d символов.";
    private static final String EDIT_LOG =
            "AI text edit: edit={} presentation={} action={} model={} status={} inputTokens={}"
                    + " cachedTokens={} outputTokens={} reasoningTokens={} durationMs={} error={}";

    private final TextEditActionRegistry actions;
    private final PresentationModelCatalog models;
    private final TargetResolver targets;
    private final PresentationAiEditRepository edits;
    private final AiEditTransactions transactions;
    private final TextEditLlm llm;
    private final TextResultSanitizer sanitizer;
    private final ObjectMapper json;
    private final Clock clock;
    private final String defaultModel;

    public AiTextEditService(
            TextEditActionRegistry actions,
            PresentationModelCatalog models,
            TargetResolver targets,
            PresentationAiEditRepository edits,
            AiEditTransactions transactions,
            TextEditLlm llm,
            TextResultSanitizer sanitizer,
            ObjectMapper json,
            Clock clock,
            @Value("${godeck.ai-edit.model:gpt-5.4-mini}") String defaultModel) {
        this.actions = actions;
        this.models = models;
        this.targets = targets;
        this.edits = edits;
        this.transactions = transactions;
        this.llm = llm;
        this.sanitizer = sanitizer;
        this.json = json;
        this.clock = clock;
        // Fail at startup rather than on the first edit when the configured model is unknown.
        this.defaultModel = models.resolve(defaultModel.strip());
    }

    /** Public action catalog; {@code enabled} is false when AI is not configured. */
    public AiActionCatalogView catalog(UUID userId) {
        return actions.catalog(new AiEditContext(userId, null), llm.enabled());
    }

    /**
     * Proposes new text for the target block.
     *
     * @param userId owner resolved from the authenticated session
     * @param presentationId presentation being edited
     * @param request validated request body
     * @return proposal, or the stored proposal for a repeated {@code request_id}
     * @throws GenerationException with a stable public code from the API contract
     */
    public TextEditView edit(UUID userId, UUID presentationId, TextEditRequest request) {
        long started = System.nanoTime();
        AiEditTarget target = target(request.target());
        TextEditAction action =
                actions.require(request.action(), target.kind(), new AiEditContext(userId, null));
        Map<String, String> params = actions.validate(action, request.paramsOrEmpty());
        String model = models.resolve(request.model() == null ? defaultModel : request.model());
        ResolvedTextTarget resolved =
                targets.resolve(userId, presentationId, target, request.text());
        if (request.refinesEditId() != null
                && !edits.existsByIdAndUserIdAndPresentationId(
                        request.refinesEditId(), userId, presentationId))
            throw new GenerationException(GenerationError.INVALID_INPUT);
        if (!llm.enabled()) throw new GenerationException(GenerationError.OPENAI_DISABLED);
        int variants = request.variantsOrDefault();

        var candidate =
                new PresentationAiEdit(
                        presentationId,
                        userId,
                        request.requestId(),
                        hash(presentationId, request, params, model, variants),
                        request.refinesEditId(),
                        action.id(),
                        json.writeValueAsString(params),
                        target.kind(),
                        target.reference(),
                        request.text().length(),
                        model,
                        clock.instant());
        AiEditTransactions.Start start = start(candidate);
        if (start.replay() != null) {
            log(start.editId(), presentationId, action.id(), model, "replayed", ResponsesUsage.NONE, started, null);
            return start.replay();
        }

        TextEditOutcome outcome;
        try {
            outcome =
                    llm.edit(
                            new TextEditPrompt(
                                    presentationId,
                                    model,
                                    action.id(),
                                    action.task(params, resolved)
                                            + TARGET_LENGTH.formatted(
                                                    action.targetLength(resolved, request.text())),
                                    resolved.maxChars(),
                                    resolved.hardMaxChars(),
                                    resolved.role(),
                                    resolved.deckTitle(),
                                    resolved.slideTitle(),
                                    action.request(params),
                                    variants,
                                    request.text()));
        } catch (RuntimeException failure) {
            GenerationError error =
                    failure instanceof AiGenerationException provider
                                    && provider.error() == GenerationError.OPENAI_DISABLED
                            ? GenerationError.OPENAI_DISABLED
                            : GenerationError.AI_EDIT_FAILED;
            transactions.fail(start.editId(), error.code(), null);
            log(start.editId(), presentationId, action.id(), model, AiEditStatus.FAILED.value(), ResponsesUsage.NONE, started, error.code());
            throw new GenerationException(error);
        }

        var cleaned =
                outcome.supported()
                        ? sanitizer.sanitize(outcome.variants(), request.text(), resolved, action)
                        : new TextResultSanitizer.Result(false, java.util.List.of());
        AiEditStatus status =
                !outcome.supported()
                        ? AiEditStatus.UNSUPPORTED
                        : cleaned.changed() ? AiEditStatus.OK : AiEditStatus.UNCHANGED;
        String message =
                switch (status) {
                    case UNSUPPORTED ->
                            outcome.message() == null || outcome.message().isBlank()
                                    ? BackendMessages.text("presentation.ai-edit.unsupported")
                                    : outcome.message().strip();
                    case UNCHANGED -> BackendMessages.text("presentation.ai-edit.unchanged");
                    default -> null;
                };
        TextEditView view =
                transactions.complete(
                        start.editId(),
                        status,
                        outcome.usage(),
                        quota ->
                                new TextEditView(
                                        start.editId(),
                                        request.requestId(),
                                        request.refinesEditId(),
                                        status,
                                        message,
                                        action.id(),
                                        request.target(),
                                        request.text(),
                                        resolved.maxChars(),
                                        resolved.hardMaxChars(),
                                        cleaned.variants(),
                                        model,
                                        AiUsageView.from(outcome.usage()),
                                        quota,
                                        false));
        log(start.editId(), presentationId, action.id(), model, status.value(), outcome.usage(), started, null);
        return view;
    }

    /**
     * Inserts the journal row; a lost race on the unique request id is retried once after the
     * rollback and then sees the winner's row (in progress or completed).
     */
    private AiEditTransactions.Start start(PresentationAiEdit candidate) {
        try {
            return transactions.start(candidate);
        } catch (DataIntegrityViolationException concurrent) {
            return transactions.start(candidate);
        }
    }

    /** Checks the structural combination of target keys and parses the editor slide id. */
    private static AiEditTarget target(TextEditTargetDto dto) {
        TargetKind kind =
                TargetKind.parse(dto.kind())
                        .orElseThrow(() -> new GenerationException(GenerationError.INVALID_INPUT));
        boolean field = dto.fieldKey() != null && !dto.fieldKey().isBlank();
        boolean block = dto.blockId() != null && !dto.blockId().isBlank();
        boolean valid =
                kind == TargetKind.TEMPLATE_FIELD
                        ? field && dto.blockId() == null
                        : block && dto.fieldKey() == null;
        if (!valid) throw new GenerationException(GenerationError.INVALID_INPUT);
        Matcher slide = SLIDE_ID.matcher(dto.slideId());
        if (!slide.matches()) throw new GenerationException(GenerationError.INVALID_TARGET);
        int number = Integer.parseInt(slide.group(1));
        return kind == TargetKind.TEMPLATE_FIELD
                ? new AiEditTarget.TemplateFieldTarget(number, dto.fieldKey())
                : new AiEditTarget.CustomBlockTarget(number, dto.blockId());
    }

    /** SHA-256 of the normalized request without {@code request_id}. */
    private String hash(
            UUID presentationId,
            TextEditRequest request,
            Map<String, String> params,
            String model,
            int variants) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        normalized.put("presentation_id", presentationId.toString());
        normalized.put("action", request.action());
        normalized.put("params", params);
        normalized.put("target_kind", request.target().kind());
        normalized.put("slide_id", request.target().slideId());
        normalized.put("field_key", request.target().fieldKey());
        normalized.put("block_id", request.target().blockId());
        normalized.put("text", request.text());
        normalized.put(
                "refines_edit_id",
                request.refinesEditId() == null ? null : request.refinesEditId().toString());
        normalized.put("variants", variants);
        normalized.put("model", model);
        return Hashing.sha256(json.writeValueAsString(normalized));
    }

    /** One line per edit, without slide or request texts. */
    private static void log(
            UUID editId,
            UUID presentationId,
            String action,
            String model,
            String status,
            ResponsesUsage usage,
            long startedNanos,
            String error) {
        log.info(
                EDIT_LOG,
                editId,
                presentationId,
                action,
                model,
                status,
                usage.inputTokens(),
                usage.cachedInputTokens(),
                usage.outputTokens(),
                usage.reasoningTokens(),
                (System.nanoTime() - startedNanos) / 1_000_000,
                error);
    }
}
