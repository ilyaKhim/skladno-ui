package ru.godeck.presentation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

@Component
class PresentationFiles {
    private static final Logger log = LoggerFactory.getLogger(PresentationFiles.class);
    private final Path directory;
    private final PresentationTemplateService templates;

    PresentationFiles(
            PresentationTemplateService templates,
            @Value("${godeck.generation.data-dir:./data/presentations}") String directory) {
        this.templates = templates;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }

    Path write(UUID id, int version, PresentationContent content) throws Exception {
        Files.createDirectories(directory);
        Path output = directory.resolve(id + "-v" + version + "-" + UUID.randomUUID() + ".pptx");
        Path temp = Files.createTempFile(directory, id.toString(), ".tmp");
        try {
            Files.write(temp, templates.render(content));
            Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE);
            return output;
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    Path existing(String path) {
        try {
            if (path == null) throw new IOException();
            Path file = Path.of(path).toRealPath();
            if (!file.startsWith(directory.toRealPath()) || !Files.isRegularFile(file))
                throw new IOException();
            return file;
        } catch (IOException e) {
            throw new GenerationException(404, "presentation_not_ready", "Готовый файл не найден.");
        }
    }

    void discard(Path output) {
        if (output != null)
            try {
                Files.deleteIfExists(output);
            } catch (IOException e) {
                log.warn(
                        "Could not delete unreferenced presentation output {}",
                        output.getFileName());
            }
    }
}
