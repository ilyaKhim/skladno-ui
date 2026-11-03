package ru.godeck.presentation.aiedit.controller;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.aiedit.dto.AiActionCatalogView;
import ru.godeck.presentation.aiedit.dto.AiEditHistoryView;
import ru.godeck.presentation.aiedit.dto.AiEditOutcomeRequest;
import ru.godeck.presentation.aiedit.dto.TextEditRequest;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.aiedit.service.AiEditHistoryService;
import ru.godeck.presentation.aiedit.service.AiTextEditService;

import java.util.UUID;

/**
 * HTTP boundary of the AI chat in the visual editor.
 *
 * <p>The endpoint only proposes text; the browser applies it as an ordinary editor change, so the
 * presentation document is never modified here. Routes are protected by the application security
 * chain (session and CSRF), and responses are private and not cacheable.
 */
@RestController
@RequestMapping("/api/generation/v1")
public class AiEditController {
    private final AiTextEditService service;
    private final AiEditHistoryService history;

    public AiEditController(AiTextEditService service, AiEditHistoryService history) {
        this.service = service;
        this.history = history;
    }

    /** Lists available actions, variant limits and whether AI is configured. */
    @GetMapping("/editor/ai/actions")
    public ResponseEntity<AiActionCatalogView> actions(Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.catalog(user(auth)));
    }

    /** Proposes new text for one block of the saved document. */
    @PostMapping("/presentations/{id}/editor/ai/text-edits")
    public ResponseEntity<TextEditView> textEdit(
            @PathVariable UUID id, @Valid @RequestBody TextEditRequest input, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.edit(user(auth), id, input));
    }

    /** Reads the AI feed of the presentation, newest records first. */
    @GetMapping("/presentations/{id}/editor/ai/history")
    public ResponseEntity<AiEditHistoryView> history(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "" + AiEditPolicy.HISTORY_DEFAULT_LIMIT) int limit,
            @RequestParam(required = false) String before,
            Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(history.history(user(auth), id, limit, before));
    }

    /** Records what the user did with a proposal; spends no quota and calls no model. */
    @PostMapping("/presentations/{id}/editor/ai/edits/{editId}/outcome")
    public ResponseEntity<Void> outcome(
            @PathVariable UUID id,
            @PathVariable UUID editId,
            @Valid @RequestBody AiEditOutcomeRequest input,
            Authentication auth) {
        history.recordOutcome(user(auth), id, editId, input);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    /** Clears the AI feed of the presentation; quota is not returned. */
    @DeleteMapping("/presentations/{id}/editor/ai/history")
    public ResponseEntity<Void> clearHistory(@PathVariable UUID id, Authentication auth) {
        history.clear(user(auth), id);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
