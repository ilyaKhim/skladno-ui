package ru.godeck.presentation.generation;

import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.ByteArrayResource;
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
import ru.godeck.presentation.ai.PresentationAiCallView;
import ru.godeck.presentation.chat.dto.ChatReply;
import ru.godeck.presentation.chat.dto.EditPresentationRequest;
import ru.godeck.presentation.dto.PresentationPage;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.generation.dto.CreatePresentationRequest;
import ru.godeck.presentation.generation.dto.PreviewPromptRequest;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.export.PresentationPdfRenderer;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.PresentationService;

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
    private final PresentationPdfRenderer pdf;

    public GenerationController(PresentationService service, PresentationPdfRenderer pdf) {
        this.service = service;
        this.pdf = pdf;
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
        return service.previewPrompt(
                input.templateId(),
                input.topic(),
                input.model(),
                input.goal(),
                input.audience(),
                input.source());
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
                                input.model(),
                                input.goal(),
                                input.audience(),
                                input.source()));
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

    /** Returns no-store AI call history visible only to the presentation owner. */
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

    /** Downloads the current published version as PPTX or its visual PDF copy. */
    @GetMapping("/v1/presentations/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable UUID id, Authentication auth,
            @RequestParam(defaultValue = "pptx") String format,
            @RequestParam(defaultValue = "false", name = "include_hidden") boolean includeHidden) {
        return attachment(service.download(user(auth), id), "godeck-" + id, format, includeHidden);
    }

    /** Downloads an owned historical version without modifying or publishing the presentation. */
    @GetMapping("/v1/presentations/{id}/versions/{version}/download")
    public ResponseEntity<Resource> downloadVersion(
            @PathVariable UUID id, @PathVariable int version, Authentication auth,
            @RequestParam(defaultValue = "pptx") String format,
            @RequestParam(defaultValue = "false", name = "include_hidden") boolean includeHidden) {
        return attachment(
                service.downloadVersion(user(auth), id, version),
                "godeck-" + id + "-v" + version, format, includeHidden);
    }

    /** Creates the common no-store attachment response for already-validated local files. */
    private ResponseEntity<Resource> attachment(Path file, String basename, String format, boolean includeHidden) {
        Resource resource;
        MediaType mediaType;
        switch (format) {
            case "pptx" -> { resource = new FileSystemResource(file); mediaType = PPTX_MEDIA_TYPE; }
            case "pdf" -> { resource = new ByteArrayResource(pdf.render(file, includeHidden)); mediaType = MediaType.APPLICATION_PDF; }
            default -> throw new GenerationException(GenerationError.INVALID_INPUT);
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(basename + "." + format).build().toString())
                .cacheControl(CacheControl.noStore())
                .body(resource);
    }

    /** Extracts the application principal installed by session security. */
    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
