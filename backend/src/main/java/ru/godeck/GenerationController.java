package ru.godeck;

import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/generation")
class GenerationController {
    private final PresentationGenerationService service;

    GenerationController(PresentationGenerationService service) { this.service = service; }

    @GetMapping("/health/ready")
    Map<String, Object> health(Authentication auth) { return service.health(); }

    @GetMapping("/v1/models")
    Map<String, Object> models(Authentication auth) { return service.models(); }

    @GetMapping("/v1/templates")
    Map<String, Object> templates(Authentication auth) { return service.catalog(); }

    @GetMapping("/v1/templates/{templateId}/context")
    Map<String, Object> context(@PathVariable String templateId, Authentication auth) { return service.context(templateId); }

    @PostMapping("/v1/prompts/preview")
    Map<String,Object> previewPrompt(@RequestBody Map<String,Object> input, Authentication auth) {
        return service.previewPrompt(String.valueOf(input.getOrDefault("template_id", "")),
                input.get("topic") instanceof String topic ? topic : null, model(input));
    }

    @GetMapping("/v1/presentations")
    Map<String, Object> list(@RequestParam(defaultValue = "20") int limit,
                             @RequestParam(defaultValue = "0") int offset, Authentication auth) {
        return service.list(user(auth), limit, offset);
    }

    @PostMapping("/v1/presentations")
    ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> input,
                                               @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                               Authentication auth) {
        return ResponseEntity.accepted().body(service.create(user(auth),
                String.valueOf(input.getOrDefault("template_id", "")),
                input.get("topic") instanceof String topic ? topic : null,
                input.get("mode") instanceof String mode ? mode : "openai", key, model(input)));
    }

    @GetMapping("/v1/presentations/{id}")
    Map<String, Object> get(@PathVariable UUID id, Authentication auth) { return service.get(user(auth), id); }

    @PutMapping("/v1/presentations/{id}/content")
    Map<String,Object> content(@PathVariable UUID id, @RequestBody Map<String,Object> input, Authentication auth) { return service.submitManual(user(auth), id, input); }

    @PostMapping("/v1/presentations/{id}/chat")
    Map<String,Object> chat(@PathVariable UUID id, @RequestBody Map<String,Object> input, Authentication auth) {
        return service.chat(user(auth), id, input.get("message") instanceof String message ? message : null, model(input));
    }

    @GetMapping("/v1/presentations/{id}/versions")
    Map<String,Object> versions(@PathVariable UUID id, Authentication auth) { return Map.of("items",service.versions(user(auth),id)); }

    @PostMapping("/v1/presentations/{id}/cancel")
    Map<String, Object> cancel(@PathVariable UUID id, Authentication auth) { return service.cancel(user(auth), id); }

    @GetMapping("/v1/presentations/{id}/download")
    ResponseEntity<Resource> download(@PathVariable UUID id, Authentication auth) {
        Path path = service.download(user(auth), id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("godeck-" + id + ".pptx").build().toString())
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body(new FileSystemResource(path));
    }

    @ExceptionHandler(PresentationGenerationService.GenerationException.class)
    ResponseEntity<Map<String, Object>> generationError(PresentationGenerationService.GenerationException error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", Map.of(
                "code", error.code(), "message", error.getMessage())));
    }

    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }

    private static String model(Map<String,Object> input) {
        Object value = input.get("model");
        if (value == null || value instanceof String) return (String) value;
        throw new PresentationGenerationService.GenerationException(422,"unsupported_model","Выберите модель из доступного списка.");
    }
}
