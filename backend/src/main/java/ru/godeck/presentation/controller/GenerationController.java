package ru.godeck.presentation.controller;

import jakarta.validation.Valid;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.dto.ChatReply;
import ru.godeck.presentation.dto.CreatePresentationRequest;
import ru.godeck.presentation.dto.EditPresentationRequest;
import ru.godeck.presentation.dto.PresentationAiCallView;
import ru.godeck.presentation.dto.PresentationPage;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.dto.PreviewPromptRequest;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.service.PresentationService;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * HTTP adapter for presentation generation, history, downloads, and AI editing.
 *
 * <p>The controller validates transport DTOs, extracts the authenticated user id, and delegates all
 * ownership and lifecycle rules to {@link PresentationService}. Download responses are explicitly
 * non-cacheable because generated files are private user data.
 */
@RestController
@RequestMapping("/api/generation")
public class GenerationController {
    private static final MediaType PPTX_MEDIA_TYPE =
            MediaType.parseMediaType(
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    private final PresentationService service;

    public GenerationController(PresentationService service) {
        this.service = service;
    }

    /** Reports readiness and provider availability for operational checks. */
    @GetMapping("/health/ready")
    public Map<String, Object> health() {
        return service.health();
    }

    /** Returns selectable AI models and the server default. */
    @GetMapping("/v1/models")
    public Map<String, Object> models() {
        return service.models();
    }

    /** Returns selectable templates with public display metadata. */
    @GetMapping("/v1/templates")
    public Map<String, Object> templates() {
        return service.catalog();
    }

    /** Returns one template's field and source-slide contract. */
    @GetMapping("/v1/templates/{templateId}/context")
    public Map<String, Object> context(@PathVariable String templateId) {
        return service.context(templateId);
    }

    /** Builds the exact structured AI request for inspection without invoking a provider. */
    @PostMapping("/v1/prompts/preview")
    public Map<String, Object> preview(@Valid @RequestBody PreviewPromptRequest input) {
        return service.previewPrompt(input.templateId(), input.topic(), input.model());
    }

    /** Lists a bounded page of presentations owned by the current session user. */
    @GetMapping("/v1/presentations")
    public PresentationPage list(
            @RequestParam(defaultValue = "" + PresentationPolicy.DEFAULT_PAGE_SIZE) int limit,
            @RequestParam(defaultValue = "0") int offset,
            Authentication auth) {
        return service.list(user(auth), limit, offset);
    }

    /** Creates an asynchronous OpenAI job or a manual job awaiting semantic content. */
    @PostMapping("/v1/presentations")
    public ResponseEntity<PresentationView> create(
            @Valid @RequestBody CreatePresentationRequest input,
            @RequestHeader(value = "Idempotency-Key", required = false) String key,
            Authentication auth) {
        return ResponseEntity.accepted()
                .body(
                        service.create(
                                user(auth),
                                input.templateId(),
                                input.topic(),
                                input.mode() == null ? GenerationMode.OPENAI.value() : input.mode(),
                                key,
                                input.model()));
    }

    /** Returns one current presentation aggregate for status polling and navigation. */
    @GetMapping("/v1/presentations/{id}")
    public PresentationView get(@PathVariable UUID id, Authentication auth) {
        return service.get(user(auth), id);
    }

    /** Supplies the complete semantic plan for a manual job and moves it into the queue. */
    @PutMapping("/v1/presentations/{id}/content")
    public PresentationView content(
            @PathVariable UUID id,
            @Valid @RequestBody PresentationContent input,
            Authentication auth) {
        return service.submitManual(user(auth), id, input);
    }

    /** Applies a natural-language edit and publishes it as a new immutable version. */
    @PostMapping("/v1/presentations/{id}/chat")
    public ChatReply chat(
            @PathVariable UUID id,
            @Valid @RequestBody EditPresentationRequest input,
            Authentication auth) {
        return service.chat(user(auth), id, input.message(), input.model());
    }

    /** Returns immutable version history for one owned presentation. */
    @GetMapping("/v1/presentations/{id}/versions")
    public Map<String, Object> versions(@PathVariable UUID id, Authentication auth) {
        return Map.of("items", service.versions(user(auth), id));
    }

    /** Returns no-store, redacted AI call diagnostics for support and observability. */
    @GetMapping("/v1/presentations/{id}/ai-calls")
    public ResponseEntity<Map<String, List<PresentationAiCallView>>> aiCalls(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("items", service.aiCalls(user(auth), id)));
    }

    /** Cancels a job only while it is still awaiting content or queued. */
    @PostMapping("/v1/presentations/{id}/cancel")
    public PresentationView cancel(@PathVariable UUID id, Authentication auth) {
        return service.cancel(user(auth), id);
    }

    /** Streams the current published PPTX as a private attachment. */
    @GetMapping("/v1/presentations/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable UUID id, Authentication auth) {
        return pptx(service.download(user(auth), id), "godeck-" + id + ".pptx");
    }

    /** Streams one immutable historical PPTX version as a private attachment. */
    @GetMapping("/v1/presentations/{id}/versions/{version}/download")
    public ResponseEntity<Resource> downloadVersion(
            @PathVariable UUID id, @PathVariable int version, Authentication auth) {
        return pptx(
                service.downloadVersion(user(auth), id, version),
                "godeck-" + id + "-v" + version + ".pptx");
    }

    /** Creates the common no-store attachment response for already-validated local files. */
    private static ResponseEntity<Resource> pptx(Path file, String filename) {
        return ResponseEntity.ok()
                .contentType(PPTX_MEDIA_TYPE)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(file));
    }

    /** Extracts the application principal installed by session security. */
    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
