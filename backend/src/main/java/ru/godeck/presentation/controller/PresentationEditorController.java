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

/**
 * HTTP boundary for the visual presentation editor.
 *
 * <p>The controller deliberately exposes draft persistence and PowerPoint publication as two
 * different operations. Frequent UI autosaves therefore update only the lightweight editor
 * snapshot, while an explicit commit performs the expensive PPTX render and creates a durable
 * presentation revision.
 *
 * <p>Authentication is resolved by Spring Security. Every service call receives the authenticated
 * user id so ownership checks happen before editor data or private assets are returned.
 */
@RestController
@RequestMapping("/api/generation/v1/presentations/{id}/editor")
public class PresentationEditorController {
    private final PresentationEditorService service;

    public PresentationEditorController(PresentationEditorService service) {
        this.service = service;
    }

    /**
     * Builds the editor document for the current published version or its compatible saved draft.
     *
     * <p>The response is private and version-sensitive, so it is explicitly marked {@code
     * no-store}. The DTO contains semantic fields plus geometry derived from the source PPTX; the
     * browser never receives server filesystem paths.
     *
     * @param id presentation being edited
     * @param auth authenticated session
     * @return versioned deck model consumed by the browser editor
     */
    @GetMapping
    public ResponseEntity<EditorDeckView> get(@PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.get(user(auth), id));
    }

    /**
     * Persists an optimistic editor draft without rendering a PowerPoint file.
     *
     * <p>Separating autosave from commit keeps typing and drag operations cheap and prevents every
     * pause in the UI from creating a presentation revision.
     *
     * @param id presentation whose draft is updated
     * @param input complete editor snapshot with base and draft revisions
     * @param auth authenticated session
     * @return the next draft revision acknowledged by the server
     */
    @PutMapping("/draft")
    public EditorDraftSavedView save(
            @PathVariable UUID id,
            @Valid @RequestBody SaveEditorDraftRequest input,
            Authentication auth) {
        return service.save(user(auth), id, input);
    }

    /**
     * Publishes the already persisted draft as a new immutable PPTX revision.
     *
     * <p>The request carries only optimistic version identifiers. The server commits its stored
     * snapshot rather than trusting a second copy of the document supplied during export.
     *
     * @param id presentation being published
     * @param input expected published and draft revisions
     * @param auth authenticated session
     * @return updated presentation metadata including the new download URL
     */
    @PostMapping("/commit")
    public PresentationView commit(
            @PathVariable UUID id,
            @Valid @RequestBody CommitEditorDraftRequest input,
            Authentication auth) {
        return service.commit(user(auth), id, input.baseVersion(), input.draftRevision());
    }

    /**
     * Validates and stores a private image asset before it is referenced by an editor draft.
     *
     * <p>Upload is a separate operation so large binary data is never embedded into editor JSON.
     * The storage layer decodes the bytes, enforces limits, and normalizes supported files to PNG.
     *
     * @param id presentation that owns the image namespace
     * @param file uploaded PNG or JPEG
     * @param auth authenticated session
     * @return opaque asset id, authenticated URL, and normalized dimensions
     */
    @PostMapping(value = "/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public EditorAssetView uploadImage(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            Authentication auth) {
        return service.uploadImage(user(auth), id, file);
    }

    /**
     * Streams a presentation-scoped image after repeating ownership and readiness checks.
     *
     * @param id presentation that owns the asset
     * @param assetId opaque image identifier
     * @param auth authenticated session
     * @return non-cacheable PNG resource
     */
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

    /** Extracts the stable application user id from the server-managed security principal. */
    private static UUID user(Authentication authentication) {
        return ((AuthPrincipal) authentication.getPrincipal()).id();
    }
}
