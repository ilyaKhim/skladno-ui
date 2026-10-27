package ru.godeck.presentation.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ru.godeck.presentation.template.TemplateSlideBackgrounds;

import java.time.Duration;

/** Serves bundled template artwork to authenticated editor sessions. No user text is included. */
@RestController
@RequestMapping("/api/generation/v1/templates/{templateId}/slides/{sourceSlide}")
public class TemplateSlideBackgroundController {
    private final TemplateSlideBackgrounds backgrounds;

    public TemplateSlideBackgroundController(TemplateSlideBackgrounds backgrounds) {
        this.backgrounds = backgrounds;
    }

    @GetMapping(value = "/background.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> background(
            @PathVariable String templateId, @PathVariable int sourceSlide) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .body(backgrounds.png(templateId, sourceSlide));
    }
}
