package ru.godeck.presentation.storage;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

import ru.godeck.presentation.policy.PresentationPolicy;

/** Image admission quotas. Overrides may tighten, but never bypass decoding safety ceilings. */
@Validated
@ConfigurationProperties("godeck.images")
public record ImageSettings(
        @DefaultValue("10MB") @NotNull DataSize maxUploadSize,
        @DefaultValue("8192") @Min(1) @Max(PresentationPolicy.MAX_IMAGE_DIMENSION) int maxDimension,
        @DefaultValue("32000000") @Min(1) @Max(PresentationPolicy.MAX_IMAGE_PIXELS) long maxPixels,
        @DefaultValue("100") @Min(1) int maxPerPresentation,
        @DefaultValue("100MB") @NotNull DataSize maxStorageSize) {

    /** The browser and multipart API still have the same fixed maximum upload contract. */
    @AssertTrue(message = "image sizes must be positive and max-upload-size cannot exceed 10MB")
    public boolean isSizesValid() {
        return maxUploadSize != null && maxStorageSize != null
                && maxUploadSize.toBytes() > 0 && maxStorageSize.toBytes() > 0
                && maxUploadSize.toBytes() <= PresentationPolicy.MAX_IMAGE_UPLOAD_BYTES;
    }
}
