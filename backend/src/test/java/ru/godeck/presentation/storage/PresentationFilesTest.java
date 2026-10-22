package ru.godeck.presentation.storage;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.template.PresentationTemplateService;

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
        when(templates.render(any())).thenReturn(new byte[] {'P', 'K', 1, 2});
        UUID id = UUID.randomUUID();
        Path first = files.write(id, 1, content), second = files.write(id, 1, content);
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
        when(templates.render(any())).thenThrow(new IOException("render failed"));
        assertThatThrownBy(() -> files.write(UUID.randomUUID(), 2, content))
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

    private void assertMissing(String path) {
        assertThatThrownBy(() -> files.existing(path))
                .isInstanceOf(GenerationException.class)
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("presentation_not_ready");
    }
}
