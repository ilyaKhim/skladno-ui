package ru.godeck.presentation.aiedit.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import ru.godeck.common.security.Hashing;
import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.ai.PresentationModelCatalog;
import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.action.TextEditActionCatalog;
import ru.godeck.presentation.aiedit.config.TextEditPromptSettings;
import ru.godeck.presentation.aiedit.ai.ResponsesUsage;
import ru.godeck.presentation.aiedit.ai.TextEditCallException;
import ru.godeck.presentation.aiedit.ai.TextEditLlm;
import ru.godeck.presentation.aiedit.ai.TextEditOutcome;
import ru.godeck.presentation.aiedit.ai.TextEditPrompt;
import ru.godeck.presentation.aiedit.ai.TextEditRequestFactory;
import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.core.AiEditTarget;
import ru.godeck.presentation.aiedit.core.AlternativeReason;
import ru.godeck.presentation.aiedit.core.FactGuardLevel;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.core.TargetResolver;
import ru.godeck.presentation.aiedit.dto.AiActionCatalogView;
import ru.godeck.presentation.aiedit.dto.AiUsageView;
import ru.godeck.presentation.aiedit.dto.TextEditRequest;
import ru.godeck.presentation.aiedit.dto.TextEditTargetDto;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.dto.TextVariantView;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;
import ru.godeck.presentation.aiedit.repository.PresentationAiEditRepository;
import ru.godeck.presentation.aiedit.text.AlternativeReply;
import ru.godeck.presentation.aiedit.text.FactGuard;
import ru.godeck.presentation.aiedit.text.TextResultSanitizer;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 *   <li>One model call without an open transaction, then deterministic sanitizing and the fact
 *       check. Long text is never truncated and never triggers a second call.
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
            "AI text edit: edit={} presentation={} action={} model={} promptVersion={} status={}"
                    + " reason={} inputTokens={} cachedTokens={} outputTokens={} reasoningTokens={}"
                    + " maxOutputTokens={} durationMs={} error={} failureReason={} factGuard={}";

    private final TextEditActionCatalog actions;
    private final PresentationModelCatalog models;
    private final TargetResolver targets;
    private final PresentationAiEditRepository edits;
    private final AiEditTransactions transactions;
    private final TextEditLlm llm;
    private final TextResultSanitizer sanitizer;
    private final FactGuard factGuard;
    private final TextEditRequestFactory requests;
    private final ObjectMapper json;
    private final Clock clock;
    private final String defaultModel;
    private final TextEditPromptSettings promptSettings;

    public AiTextEditService(
            TextEditActionCatalog actions,
            PresentationModelCatalog models,
            TargetResolver targets,
            PresentationAiEditRepository edits,
            AiEditTransactions transactions,
            TextEditLlm llm,
            TextResultSanitizer sanitizer,
            FactGuard factGuard,
            TextEditRequestFactory requests,
            ObjectMapper json,
            Clock clock,
            @Value("${godeck.ai-edit.model:gpt-5.4-mini}") String defaultModel,
            TextEditPromptSettings promptSettings) {
        this.actions = actions;
        this.models = models;
        this.targets = targets;
        this.edits = edits;
        this.transactions = transactions;
        this.llm = llm;
        this.sanitizer = sanitizer;
        this.factGuard = factGuard;
        this.requests = requests;
        this.json = json;
        this.clock = clock;
        // Fail at startup rather than on the first edit when the configured model is unknown.
        this.defaultModel = models.resolve(defaultModel.strip());
        this.promptSettings = promptSettings;
    }

    /** Public action catalog; {@code enabled} is false when AI is not configured. */
    public AiActionCatalogView catalog(UUID userId) {
        return actions.catalog(llm.enabled());
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
                actions.require(request.action());
        Map<String, String> params = actions.validate(action, request.paramsOrEmpty());
        String model = model(request.model());
        ResolvedTextTarget resolved =
                targets.resolve(
                        userId, presentationId, target, request.text(), action.allowsEmptySource());
        if (request.refinesEditId() != null
                && !edits.existsByIdAndUserIdAndPresentationIdAndTargetKindAndTargetRef(
                        request.refinesEditId(),
                        userId,
                        presentationId,
                        target.kind(),
                        target.reference()))
            throw new GenerationException(GenerationError.INVALID_INPUT);
        if (!llm.enabled()) throw new GenerationException(GenerationError.OPENAI_DISABLED);
        int variants = request.variantsOrDefault();
        String instruction = action.request(params);
        int maxOutputTokens = requests.maxOutputTokens(variants, resolved.maxChars());

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
                        TextEditRequestFactory.PROMPT_VERSION,
                        maxOutputTokens,
                        instruction == null ? null : instruction.length(),
                        clock.instant());
        AiEditTransactions.Start start = transactions.start(candidate);
        if (start.replay() != null) {
            log(
                    new LogLine(start.editId(), presentationId, action.id(), model, "replayed"),
                    start.replay().reason(),
                    ResponsesUsage.NONE,
                    maxOutputTokens,
                    durationMs(started),
                    null,
                    null,
                    null);
            return start.replay();
        }

        TextEditOutcome outcome = null;
        Proposal built;
        try {
            outcome =
                    llm.edit(
                            new TextEditPrompt(
                                    presentationId,
                                    model,
                                    action.id(),
                                    action.task()
                                            + TARGET_LENGTH.formatted(
                                                    action.targetLength(resolved, request.text(), promptSettings.shortenRatio())),
                                    resolved.maxChars(),
                                    resolved.hardMaxChars(),
                                    resolved.role(),
                                    resolved.deckTitle(),
                                    resolved.slideTitle(),
                                    instruction,
                                    variants,
                                    request.text()));
            built = proposal(outcome, request.text(), instruction, resolved, action);
        } catch (RuntimeException failure) {
            GenerationError error =
                    failure instanceof AiGenerationException provider
                                    && provider.error() == GenerationError.OPENAI_DISABLED
                            ? GenerationError.OPENAI_DISABLED
                            : GenerationError.AI_EDIT_FAILED;
            TextEditCallException call = failure instanceof TextEditCallException known ? known : null;
            // A failure after the answer still spent its tokens.
            ResponsesUsage usage =
                    call != null
                            ? call.usage()
                            : outcome == null ? ResponsesUsage.NONE : outcome.usage();
            AiEditFailureReason reason =
                    call == null ? AiEditFailureReason.INTERNAL : call.failureReason();
            long duration = durationMs(started);
            transactions.fail(start.editId(), error.code(), usage, reason, duration);
            log(
                    new LogLine(start.editId(), presentationId, action.id(), model, AiEditStatus.FAILED.value()),
                    null,
                    usage,
                    maxOutputTokens,
                    duration,
                    error.code(),
                    reason.value(),
                    null);
            throw new GenerationException(error);
        }

        Proposal proposal = built;
        ResponsesUsage spent = outcome.usage();
        long duration = durationMs(started);
        String reason = proposal.reason() == null ? null : proposal.reason().value();
        var telemetry =
                new AiEditTransactions.Telemetry(
                        spent, reason, proposal.factGuard().value(), duration);
        TextEditView view =
                transactions.complete(
                        start.editId(),
                        proposal.status(),
                        telemetry,
                        quota ->
                                new TextEditView(
                                        start.editId(),
                                        request.requestId(),
                                        request.refinesEditId(),
                                        proposal.status(),
                                        reason,
                                        proposal.message(),
                                        proposal.suggestions(),
                                        action.id(),
                                        request.target(),
                                        request.text(),
                                        resolved.maxChars(),
                                        resolved.hardMaxChars(),
                                        proposal.variants(),
                                        model,
                                        AiUsageView.from(spent),
                                        quota,
                                        false));
        log(
                new LogLine(start.editId(), presentationId, action.id(), model, proposal.status().value()),
                reason,
                spent,
                maxOutputTokens,
                duration,
                null,
                null,
                proposal.factGuard().value());
        return view;
    }

    /** Turns a parsed model answer into what the user sees; there is no reply without an action. */
    private Proposal proposal(
            TextEditOutcome outcome,
            String source,
            String instruction,
            ResolvedTextTarget target,
            TextEditAction action) {
        FactGuard.Known known =
                factGuard.known(
                        Arrays.asList(
                                source,
                                instruction,
                                target.role(),
                                target.deckTitle(),
                                target.slideTitle()));
        if (outcome.alternative()) {
            // A suggestion returns as the next request, where its text would count as known.
            List<String> safe =
                    outcome.suggestions().stream()
                            .filter(text -> factGuard.check(text, known, false) != FactGuardLevel.BLOCKED)
                            .toList();
            boolean messageBlocked =
                    factGuard.check(outcome.message(), known, false) == FactGuardLevel.BLOCKED;
            boolean blocked = messageBlocked || safe.size() < outcome.suggestions().size();
            return alternative(
                    outcome.reason(),
                    AlternativeReply.of(outcome.reason(), messageBlocked ? null : outcome.message(), safe),
                    blocked ? FactGuardLevel.BLOCKED : FactGuardLevel.NONE);
        }
        List<String> texts = new ArrayList<>();
        Set<String> flagged = new java.util.HashSet<>();
        Set<String> blockedRaw = new java.util.HashSet<>();
        for (TextEditOutcome.Variant variant : outcome.variants()) {
            texts.add(variant.text());
            String clean = sanitizer.clean(variant.text(), source);
            if (variant.checkFacts()) flagged.add(clean);
            if (factGuard.check(variant.text(), known, false) == FactGuardLevel.BLOCKED)
                blockedRaw.add(clean);
        }
        var cleaned = sanitizer.sanitize(texts, source, target, action);
        if (!cleaned.changed())
            return new Proposal(
                    AiEditStatus.UNCHANGED,
                    null,
                    BackendMessages.text("presentation.ai-edit.unchanged"),
                    List.of(),
                    List.of(),
                    FactGuardLevel.NONE);
        FactGuard.Review review = factGuard.review(cleaned.variants(), known, flagged, blockedRaw);
        if (review.variants().isEmpty())
            return alternative(
                    AlternativeReason.NEEDS_SOURCE,
                    AlternativeReply.standard(AlternativeReason.NEEDS_SOURCE),
                    review.level());
        return new Proposal(
                AiEditStatus.OK, null, null, List.of(), review.variants(), review.level());
    }

    private static Proposal alternative(
            AlternativeReason reason, AlternativeReply reply, FactGuardLevel level) {
        return new Proposal(
                AiEditStatus.ALTERNATIVE, reason, reply.message(), reply.suggestions(), List.of(), level);
    }

    private static long durationMs(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000;
    }

    /**
     * The contract allows {@code null} or a catalog id. A blank value is neither, and the catalog
     * would otherwise resolve it to the generation default instead of the text-edit model.
     */
    private String model(String requested) {
        if (requested == null) return defaultModel;
        if (requested.isBlank()) throw new GenerationException(GenerationError.UNSUPPORTED_MODEL);
        return models.resolve(requested);
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

    /** One line per edit, without slide or request texts: only ids, numbers and codes. */
    private static void log(
            LogLine line,
            String reason,
            ResponsesUsage usage,
            int maxOutputTokens,
            long durationMs,
            String error,
            String failureReason,
            String factGuard) {
        log.info(
                EDIT_LOG,
                line.editId(),
                line.presentationId(),
                line.action(),
                line.model(),
                TextEditRequestFactory.PROMPT_VERSION,
                line.status(),
                reason,
                usage.inputTokens(),
                usage.cachedInputTokens(),
                usage.outputTokens(),
                usage.reasoningTokens(),
                maxOutputTokens,
                durationMs,
                error,
                failureReason,
                factGuard);
    }

    private record LogLine(
            UUID editId, UUID presentationId, String action, String model, String status) {}

    private record Proposal(
            AiEditStatus status,
            AlternativeReason reason,
            String message,
            List<String> suggestions,
            List<TextVariantView> variants,
            FactGuardLevel factGuard) {}
}
