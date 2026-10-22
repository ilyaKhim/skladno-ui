package ru.godeck.presentation;

import static ru.godeck.presentation.PresentationDtos.*;

import jakarta.validation.Valid;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import ru.godeck.auth.AuthPrincipal;

import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/generation")
class GenerationController {
    private final PresentationService service;

    GenerationController(PresentationService service) {
        this.service = service;
    }

    @GetMapping("/health/ready")
    Map<String, Object> health() {
        return service.health();
    }

    @GetMapping("/v1/models")
    Map<String, Object> models() {
        return service.models();
    }

    @GetMapping("/v1/templates")
    Map<String, Object> templates() {
        return service.catalog();
    }

    @GetMapping("/v1/templates/{templateId}/context")
    Map<String, Object> context(@PathVariable String templateId) {
        return service.context(templateId);
    }

    @PostMapping("/v1/prompts/preview")
    Map<String, Object> preview(@Valid @RequestBody PreviewInput input) {
        return service.previewPrompt(input.templateId(), input.topic(), input.model());
    }

    @GetMapping("/v1/presentations")
    Page list(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset,
            Authentication auth) {
        return service.list(user(auth), limit, offset);
    }

    @PostMapping("/v1/presentations")
    ResponseEntity<View> create(
            @Valid @RequestBody CreateInput input,
            @RequestHeader(value = "Idempotency-Key", required = false) String key,
            Authentication auth) {
        return ResponseEntity.accepted()
                .body(
                        service.create(
                                user(auth),
                                input.templateId(),
                                input.topic(),
                                input.mode() == null ? "openai" : input.mode(),
                                key,
                                input.model()));
    }

    @GetMapping("/v1/presentations/{id}")
    View get(@PathVariable UUID id, Authentication auth) {
        return service.get(user(auth), id);
    }

    @PutMapping("/v1/presentations/{id}/content")
    View content(
            @PathVariable UUID id,
            @Valid @RequestBody PresentationContent input,
            Authentication auth) {
        return service.submitManual(user(auth), id, input);
    }

    @PostMapping("/v1/presentations/{id}/chat")
    ChatReply chat(
            @PathVariable UUID id, @Valid @RequestBody ChatInput input, Authentication auth) {
        return service.chat(user(auth), id, input.message(), input.model());
    }

    @GetMapping("/v1/presentations/{id}/versions")
    Map<String, Object> versions(@PathVariable UUID id, Authentication auth) {
        return Map.of("items", service.versions(user(auth), id));
    }

    @PostMapping("/v1/presentations/{id}/cancel")
    View cancel(@PathVariable UUID id, Authentication auth) {
        return service.cancel(user(auth), id);
    }

    @GetMapping("/v1/presentations/{id}/download")
    ResponseEntity<Resource> download(@PathVariable UUID id, Authentication auth) {
        Path file = service.download(user(auth), id);
        return ResponseEntity.ok()
                .contentType(
                        MediaType.parseMediaType(
                                "application/vnd.openxmlformats-officedocument.presentationml.presentation"))
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename("godeck-" + id + ".pptx")
                                .build()
                                .toString())
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(file));
    }

    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
