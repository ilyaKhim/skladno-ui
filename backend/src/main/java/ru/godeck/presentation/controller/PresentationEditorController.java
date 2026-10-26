package ru.godeck.presentation.controller;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.dto.CommitEditorDraftRequest;
import ru.godeck.presentation.dto.EditorAssetView;
import ru.godeck.presentation.dto.EditorDeckView;
import ru.godeck.presentation.dto.EditorDraftSavedView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.dto.SaveEditorDraftRequest;
import ru.godeck.presentation.service.PresentationEditorService;

import java.util.UUID;

@RestController
@RequestMapping("/api/generation/v1/presentations/{id}/editor")
public class PresentationEditorController {
    private final PresentationEditorService service;

    public PresentationEditorController(PresentationEditorService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<EditorDeckView> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.get(user(auth), id));
    }

    @PutMapping("/draft")
    public EditorDraftSavedView save(
            @PathVariable UUID id,
            @Valid @RequestBody SaveEditorDraftRequest input,
            Authentication auth) {
        return service.save(user(auth), id, input);
    }

    @PostMapping("/commit")
    public PresentationView commit(
            @PathVariable UUID id,
            @Valid @RequestBody CommitEditorDraftRequest input,
            Authentication auth) {
        return service.commit(user(auth), id, input.baseVersion(), input.draftRevision());
    }

    @PostMapping(value = "/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public EditorAssetView uploadImage(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            Authentication auth) {
        return service.uploadImage(user(auth), id, file);
    }

    @GetMapping("/assets/{assetId}")
    public ResponseEntity<Resource> image(
            @PathVariable UUID id,
            @PathVariable UUID assetId,
            Authentication auth) {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(service.image(user(auth), id, assetId)));
    }

    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
