package ru.godeck.presentation.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.material.MaterialJobService;

import java.util.UUID;

/** Owner-scoped upload jobs. The API stores bounded input; only the isolated worker parses it. */
@RestController
@RequestMapping("/api/generation/v1/materials")
public class MaterialController {
    private final MaterialJobService materials;

    public MaterialController(MaterialJobService materials) {
        this.materials = materials;
    }

    /** Accepts a durable extraction job without creating a presentation or making an AI call. */
    @PostMapping(value = "/extract", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MaterialJobService.Job> extract(
            @RequestPart("file") MultipartFile file,
            MultipartHttpServletRequest request,
            Authentication auth) {
        if (request.getMultiFileMap().values().stream().mapToInt(java.util.List::size).sum() != 1)
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .body(materials.submit(((AuthPrincipal) auth.getPrincipal()).id(), file));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MaterialJobService.Job> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(materials.get(((AuthPrincipal) auth.getPrincipal()).id(), id));
    }
}
