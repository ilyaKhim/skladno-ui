package ru.godeck.presentation.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import ru.godeck.presentation.dto.ExtractedMaterial;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.material.MaterialExtractionService;

/**
 * Authenticated, CSRF-protected text extraction; no provider call or persistent upload is created.
 */
@RestController
@RequestMapping("/api/generation/v1/materials")
public class MaterialController {
    private final MaterialExtractionService materials;

    public MaterialController(MaterialExtractionService materials) {
        this.materials = materials;
    }

    /**
     * Returns private preview text without creating a presentation, storage record, or paid call.
     */
    @PostMapping(value = "/extract", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ExtractedMaterial> extract(
            @RequestPart("file") MultipartFile file, MultipartHttpServletRequest request) {
        if (request.getMultiFileMap().values().stream().mapToInt(java.util.List::size).sum() != 1)
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(materials.extract(file));
    }
}
