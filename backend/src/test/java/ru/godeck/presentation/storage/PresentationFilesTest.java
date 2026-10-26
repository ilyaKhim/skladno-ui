package ru.godeck.presentation.storage;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.template.PresentationTemplateService;

import javax.imageio.ImageIO;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

class PresentationFilesTest {
    @TempDir Path root;
    private Path directory;
    private PresentationFiles files;
    private final PresentationTemplateService templates = mock(PresentationTemplateService.class);
    private final PresentationContent content = new PresentationContent(Map.of(), List.of());

    @BeforeEach
    void setUp() throws Exception {
        directory = Files.createDirectory(root.resolve("output"));
        files = new PresentationFiles(templates, directory.toString());
    }

    @Test
    void outputWritesAreUniqueAndNeverExposeTemporaryFiles() throws Exception {
        when(templates.render(eq("aurora"), any())).thenReturn(new byte[] {'P', 'K', 1, 2});
        UUID id = UUID.randomUUID();
        Path first = files.write(id, 1, "aurora", content),
                second = files.write(id, 1, "aurora", content);
        assertThat(first).isNotEqualTo(second);
        assertThat(Files.readAllBytes(first))
                .containsExactly((byte) 'P', (byte) 'K', (byte) 1, (byte) 2);
        assertThat(files.existing(first.toString())).isEqualTo(first.toRealPath());
        try (var paths = Files.list(directory)) {
            assertThat(paths.toList()).hasSize(2).allMatch(p -> p.toString().endsWith(".pptx"));
        }
    }

    @Test
    void renderFailureRemovesTemporaryFileAndPreservesExistingOutput() throws Exception {
        Path previous = Files.writeString(directory.resolve("previous.pptx"), "old");
        when(templates.render(eq("aurora"), any())).thenThrow(new IOException("render failed"));
        assertThatThrownBy(() -> files.write(UUID.randomUUID(), 2, "aurora", content))
                .isInstanceOf(IOException.class);
        assertThat(Files.readString(previous)).isEqualTo("old");
        try (var paths = Files.list(directory)) {
            assertThat(paths.toList()).containsExactly(previous);
        }
    }

    @Test
    void outsidePathsAndSymlinksCannotBeDownloaded() throws Exception {
        Path outside = Files.writeString(root.resolve("outside.pptx"), "private");
        Path link = Files.createSymbolicLink(directory.resolve("link.pptx"), outside);
        for (String path :
                List.of(
                        outside.toString(),
                        link.toString(),
                        directory.resolve("../outside.pptx").toString())) assertMissing(path);
    }

    @Test
    void nullInvalidMissingAndDirectoryPathsAreReportedAsNotReady() {
        assertMissing(null);
        assertMissing("bad\u0000path");
        assertMissing(directory.resolve("missing.pptx").toString());
        assertMissing(directory.toString());
    }

    @Test
    void failedOutputCleanupIsIdempotent() throws Exception {
        Path output = Files.writeString(directory.resolve("failed.pptx"), "failed");
        files.discard(output);
        files.discard(output);
        files.discard(null);
        assertThat(Files.exists(output)).isFalse();
    }

    @Test
    void uploadedImagesAreValidatedNormalizedAndScopedToTheirPresentation() throws Exception {
        UUID presentationId = UUID.randomUUID();
        var stored = files.storeImage(presentationId, png(12, 7));

        assertThat(stored.width()).isEqualTo(12);
        assertThat(stored.height()).isEqualTo(7);
        assertThat(files.image(presentationId, stored.id())).exists();
        assertThat(files.imageBytes(presentationId, stored.id()))
                .startsWith((byte) 0x89, (byte) 0x50, (byte) 0x4e, (byte) 0x47);
        assertThatThrownBy(() -> files.image(UUID.randomUUID(), stored.id()))
                .isInstanceOf(GenerationException.class)
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("image_not_found");
    }

    @Test
    void rejectsEmptyUndecodableAndUnsupportedImages() throws Exception {
        for (byte[] invalid : List.of(new byte[0], "not an image".getBytes(), image(2, 2, "gif")))
            assertImageError(invalid, "invalid_image");
        assertImageError(null, "invalid_image");
    }

    @Test
    void rejectsUploadsAboveTheByteLimitBeforeDecoding() {
        assertImageError(
                new byte[PresentationPolicy.MAX_IMAGE_UPLOAD_BYTES + 1], "image_limit");
    }

    @Test
    void rejectsImagesAboveTheDimensionLimitBeforeFullDecode() throws Exception {
        assertImageError(
                png(PresentationPolicy.MAX_IMAGE_DIMENSION + 1, 1), "image_limit");
    }

    private static byte[] png(int width, int height) throws IOException {
        return image(width, height, "png");
    }

    private static byte[] image(int width, int height, String format) throws IOException {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        var graphics = image.createGraphics();
        graphics.setColor(new Color(0x33, 0x5c, 0xc5));
        graphics.fillRect(0, 0, width, height);
        graphics.dispose();
        var output = new ByteArrayOutputStream();
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }

    private void assertImageError(byte[] bytes, String code) {
        assertThatThrownBy(() -> files.storeImage(UUID.randomUUID(), bytes))
                .isInstanceOf(GenerationException.class)
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo(code);
    }

    private void assertMissing(String path) {
        assertThatThrownBy(() -> files.existing(path))
                .isInstanceOf(GenerationException.class)
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("presentation_not_ready");
    }
}
