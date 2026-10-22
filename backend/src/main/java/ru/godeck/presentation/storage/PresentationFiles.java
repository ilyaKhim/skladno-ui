package ru.godeck.presentation.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Component
public class PresentationFiles {
    private static final String OUTPUT_DELETE_FAILURE_LOG =
            "Could not delete unreferenced presentation output {}";

    private static final Logger log = LoggerFactory.getLogger(PresentationFiles.class);
    private final Path directory;
    private final PresentationTemplateService templates;

    public PresentationFiles(
            PresentationTemplateService templates,
            @Value("${godeck.generation.data-dir:./data/presentations}") String directory) {
        this.templates = templates;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }

    public Path write(UUID id, int version, PresentationContent content) throws Exception {
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

    public Path existing(String path) {
        try {
            if (path == null) throw new IOException();
            Path file = Path.of(path).toRealPath();
            if (!file.startsWith(directory.toRealPath()) || !Files.isRegularFile(file))
                throw new IOException();
            return file;
        } catch (IOException | InvalidPathException e) {
            throw new GenerationException(GenerationError.FILE_NOT_READY);
        }
    }

    public void discard(Path output) {
        if (output != null)
            try {
                Files.deleteIfExists(output);
            } catch (IOException e) {
                log.warn(OUTPUT_DELETE_FAILURE_LOG, output.getFileName());
            }
    }
}
