package ru.godeck.presentation.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.template.TextLengthMode;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Private filesystem boundary for rendered presentations and editor image assets.
 *
 * <p>The component owns path construction, atomic publication, image decoding/normalization, quota
 * checks, and containment checks. Callers work with presentation/asset ids and never concatenate
 * untrusted request paths themselves.
 */
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

    /**
     * Renders and atomically publishes one immutable PPTX version.
     *
     * <p>A random final filename avoids collisions between retries. Rendering first to a temporary
     * file means downloaders never observe a partial ZIP/PPTX. If rendering fails, the temporary file
     * is removed and the transaction layer can safely leave the previous version current.
     */
    public Path write(UUID id, int version, String templateId, PresentationContent content)
            throws Exception {
        return write(id, version, templateId, content, TextLengthMode.TRUNCATE);
    }

    /**
     * Same as {@link #write(UUID, int, String, PresentationContent)}, with an explicit length policy
     * for template field text. The visual editor export passes {@link
     * TextLengthMode#ALLOW_OVERFLOW} so text longer than {@code max_chars} is not shortened.
     */
    public Path write(
            UUID id,
            int version,
            String templateId,
            PresentationContent content,
            TextLengthMode mode)
            throws Exception {
        Files.createDirectories(directory);
        Path output = directory.resolve(id + "-v" + version + "-" + UUID.randomUUID() + ".pptx");
        Path temp = Files.createTempFile(directory, id.toString(), ".tmp");
        try {
            boolean hasImages =
                    content.slides().stream()
                            .anyMatch(slide -> !slide.imageBlocksOrEmpty().isEmpty());
            byte[] rendered;
            if (mode == TextLengthMode.TRUNCATE)
                rendered =
                        hasImages
                                ? templates.render(
                                        templateId,
                                        content,
                                        assetId -> imageBytes(id, UUID.fromString(assetId)))
                                : templates.render(templateId, content);
            else
                rendered =
                        templates.render(
                                templateId,
                                content,
                                assetId -> imageBytes(id, UUID.fromString(assetId)),
                                mode);
            Files.write(temp, rendered);
            Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE);
            return output;
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    /**
     * Validates, decodes, re-encodes, and atomically stores an uploaded image.
     *
     * <p>Re-encoding accepted JPEG/PNG input as PNG strips unrelated payload/metadata and guarantees
     * the renderer receives a known representation. Dimension, pixel, per-file, count, and aggregate
     * limits bound memory and disk use.
     */
    public ImageAsset storeImage(UUID presentationId, byte[] bytes) {
        if (bytes == null || bytes.length == 0)
            throw new GenerationException(GenerationError.INVALID_IMAGE);
        if (bytes.length > PresentationPolicy.MAX_IMAGE_UPLOAD_BYTES)
            throw new GenerationException(GenerationError.IMAGE_LIMIT);
        DecodedImage decoded = decodeImage(bytes);
        byte[] normalized = encodePng(decoded.image());
        if (normalized.length > PresentationPolicy.MAX_IMAGE_UPLOAD_BYTES)
            throw new GenerationException(GenerationError.IMAGE_LIMIT);

        Path assets = assetDirectory(presentationId);
        UUID assetId = UUID.randomUUID();
        Path output = assets.resolve(assetId + ".png");
        Path temp = null;
        try {
            Files.createDirectories(assets);
            enforceAssetQuota(assets, normalized.length);
            temp = Files.createTempFile(assets, assetId.toString(), ".tmp");
            Files.write(temp, normalized);
            Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE);
            return new ImageAsset(assetId, decoded.width(), decoded.height());
        } catch (GenerationException known) {
            throw known;
        } catch (Exception failure) {
            throw new GenerationException(GenerationError.INVALID_IMAGE);
        } finally {
            deleteTemporaryImage(temp);
        }
    }

    /** Reads image headers and pixels while rejecting unsupported formats and decompression bombs. */
    private static DecodedImage decodeImage(byte[] bytes) {
        try (ImageInputStream input =
                ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) throw new IOException();
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException();
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName();
                if (!"png".equalsIgnoreCase(format) && !"jpeg".equalsIgnoreCase(format))
                    throw new IOException();
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1
                        || height < 1
                        || width > PresentationPolicy.MAX_IMAGE_DIMENSION
                        || height > PresentationPolicy.MAX_IMAGE_DIMENSION
                        || (long) width * height > PresentationPolicy.MAX_IMAGE_PIXELS)
                    throw new GenerationException(GenerationError.IMAGE_LIMIT);
                BufferedImage image = reader.read(0);
                if (image == null) throw new IOException();
                return new DecodedImage(image, width, height);
            } finally {
                reader.dispose();
            }
        } catch (GenerationException known) {
            throw known;
        } catch (Exception invalid) {
            throw new GenerationException(GenerationError.INVALID_IMAGE);
        }
    }

    private static byte[] encodePng(BufferedImage image) {
        try {
            ByteArrayOutputStream normalized = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "png", normalized)) throw new IOException();
            return normalized.toByteArray();
        } catch (Exception failure) {
            throw new GenerationException(GenerationError.INVALID_IMAGE);
        }
    }

    private static void deleteTemporaryImage(Path temp) {
        if (temp == null) return;
        try {
            Files.deleteIfExists(temp);
        } catch (IOException ignored) {
            // The temporary file remains inside the private asset directory.
        }
    }

    /**
     * Resolves an asset through real paths and verifies that it remains inside this presentation's
     * private directory, including in the presence of symlinks.
     */
    public Path image(UUID presentationId, UUID assetId) {
        try {
            Path assets = assetDirectory(presentationId).toRealPath();
            Path image = assets.resolve(assetId + ".png").toRealPath();
            if (!image.startsWith(assets) || !Files.isRegularFile(image)) throw new IOException();
            return image;
        } catch (IOException | InvalidPathException missing) {
            throw new GenerationException(GenerationError.IMAGE_NOT_FOUND);
        }
    }

    /** Returns trusted bytes for insertion into a rendered presentation. */
    public byte[] imageBytes(UUID presentationId, UUID assetId) {
        try {
            return Files.readAllBytes(image(presentationId, assetId));
        } catch (IOException missing) {
            throw new GenerationException(GenerationError.IMAGE_NOT_FOUND);
        }
    }

    private Path assetDirectory(UUID presentationId) {
        return directory.resolve("assets").resolve(presentationId.toString()).normalize();
    }

    /** Enforces per-presentation asset count and byte quotas before publishing a new image. */
    private static void enforceAssetQuota(Path assets, long incomingBytes) throws IOException {
        int count = 0;
        long total = 0;
        try (var paths = Files.list(assets)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                if (!path.getFileName().toString().endsWith(".png")) continue;
                count++;
                total += Files.size(path);
            }
        }
        if (count >= PresentationPolicy.MAX_IMAGES_PER_PRESENTATION
                || total + incomingBytes > PresentationPolicy.MAX_IMAGE_STORAGE_BYTES)
            throw new GenerationException(GenerationError.IMAGE_LIMIT);
    }

    /**
     * Metadata returned after a normalized image has been durably stored.
     *
     * @param id opaque presentation-scoped asset identifier
     * @param width decoded pixel width
     * @param height decoded pixel height
     */
    public record ImageAsset(UUID id, int width, int height) {}

    private record DecodedImage(BufferedImage image, int width, int height) {}

    /**
     * Resolves a previously persisted PPTX path and proves that it is a regular file inside the
     * configured output directory before a controller exposes it for download.
     */
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

    /** Best-effort compensation for a rendered file whose database publication did not succeed. */
    public void discard(Path output) {
        if (output != null)
            try {
                Files.deleteIfExists(output);
            } catch (IOException e) {
                log.warn(OUTPUT_DELETE_FAILURE_LOG, output.getFileName());
            }
    }
}
