package ru.godeck.presentation.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.dto.PresentationOutlineView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.mapper.PresentationOutlineRequestCodec;
import ru.godeck.presentation.service.PresentationOutlineService;

import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.UUID;

/**
 * Owner-scoped review API. Session authentication and CSRF are enforced by the existing security
 * chain.
 */
@RestController
@RequestMapping("/api/generation/v1/presentations/{id}/outline")
public class PresentationOutlineController {
    private final PresentationOutlineService outlines;
    private final PresentationOutlineRequestCodec requests;

    public PresentationOutlineController(
            PresentationOutlineService outlines, PresentationOutlineRequestCodec requests) {
        this.outlines = outlines;
        this.requests = requests;
    }

    /** Returns the saved plan with private no-store caching semantics. */
    @GetMapping
    public ResponseEntity<PresentationOutlineView> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(outlines.get(user(auth), id));
    }

    /** Saves only the narrow writable outline subset against its optimistic revision. */
    @PutMapping
    public ResponseEntity<PresentationOutlineView> save(
            @PathVariable UUID id, @RequestBody JsonNode body, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(outlines.save(user(auth), id, requests.save(body)));
    }

    /** Idempotently freezes one saved revision and schedules render-only work. */
    @PostMapping("/confirm")
    public ResponseEntity<PresentationView> confirm(
            @PathVariable UUID id, @RequestBody JsonNode body, Authentication auth) {
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .body(outlines.confirm(user(auth), id, requests.confirm(body)));
    }

    /** Uses the outline error contract for malformed JSON without returning parser details. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> invalidJson(
            HttpMessageNotReadableException invalid) {
        var error = GenerationError.INVALID_OUTLINE;
        return ResponseEntity.unprocessableEntity()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("error", Map.of("code", error.code(), "message", error.message())));
    }

    private static UUID user(Authentication auth) {
        return ((AuthPrincipal) auth.getPrincipal()).id();
    }
}
