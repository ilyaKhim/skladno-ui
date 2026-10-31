package ru.godeck.presentation.export;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/** Bounds rendering resolution and simultaneous CPU/memory-heavy PDF exports. */
@Validated
@ConfigurationProperties("godeck.pdf-export")
public record PdfExportSettings(
        @DefaultValue("144") @Min(72) @Max(216) int dpi,
        @DefaultValue("2") @Min(1) @Max(4) int maxConcurrentExports) {}
