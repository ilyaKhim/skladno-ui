package ru.godeck.presentation.material;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.presentation.dto.ExtractedMaterial;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.GenerationInput;

import tools.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.jar.JarFile;

/**
 * Stateless bounded upload boundary. Each parser runs in a disposable heap-limited JVM: a timeout
 * kills that process, rather than pretending that interrupting a Java Future stops hostile input.
 * Raw bytes exist only in a randomly named private temporary directory and are deleted afterward.
 */
@Service
public class MaterialExtractionService {
    private static final int MAX_RESULT_BYTES = 200_000;
    private final Semaphore slots = new Semaphore(2);
    private final ObjectMapper json;

    public MaterialExtractionService(ObjectMapper json) {
        this.json = json;
    }

    /**
     * Validates the upload before reserving a parser slot and always releases its temporary data.
     */
    public ExtractedMaterial extract(MultipartFile file) {
        if (file.isEmpty()) throw new GenerationException(GenerationError.SOURCE_EMPTY);
        if (file.getSize() > MaterialPolicy.MAX_FILE_BYTES)
            throw new GenerationException(GenerationError.SOURCE_LIMIT);
        String name = GenerationInput.safeName(file.getOriginalFilename());
        String format = format(name);
        if (!slots.tryAcquire()) throw new GenerationException(GenerationError.SOURCE_BUSY);
        Path directory = null;
        Process process = null;
        try {
            directory = Files.createTempDirectory("godeck-material-");
            Path input = directory.resolve("input");
            Path output = directory.resolve("result.json");
            try (var stream = file.getInputStream()) {
                byte[] bytes = stream.readNBytes(MaterialPolicy.MAX_FILE_BYTES + 1);
                if (bytes.length > MaterialPolicy.MAX_FILE_BYTES)
                    throw new GenerationException(GenerationError.SOURCE_LIMIT);
                validateSignature(bytes, format);
                Files.write(input, bytes);
            }
            var builder =
                    new ProcessBuilder(command(input, output, format))
                            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                            .redirectError(ProcessBuilder.Redirect.DISCARD);
            // Parser helpers have no use for provider keys, DB credentials, or JVM agent env vars.
            builder.environment().clear();
            process = builder.start();
            if (!process.waitFor(
                    MaterialPolicy.EXTRACTION_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS))
                throw new GenerationException(GenerationError.SOURCE_TIMEOUT);
            if (process.exitValue() != 0
                    || !Files.exists(output)
                    || Files.size(output) > MAX_RESULT_BYTES)
                throw new GenerationException(GenerationError.SOURCE_INVALID);
            var tree = json.readTree(Files.readAllBytes(output));
            if (tree.has("error")) {
                String code = tree.path("error").asText();
                GenerationError error =
                        Arrays.stream(GenerationError.values())
                                .filter(value -> value.code().equals(code))
                                .findFirst()
                                .orElse(GenerationError.SOURCE_INVALID);
                throw new GenerationException(error);
            }
            var result = json.treeToValue(tree, ExtractedMaterial.class);
            String text = GenerationInput.sourceText(result.text());
            return new ExtractedMaterial(
                    format, name, text, text.length(), result.pages(), result.warnings());
        } catch (GenerationException known) {
            throw known;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new GenerationException(GenerationError.SOURCE_TIMEOUT);
        } catch (Exception failure) {
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
                try {
                    process.waitFor(1, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (directory != null) {
                deleteDirectory(directory);
            }
            slots.release();
        }
    }

    private static String format(String name) {
        int separator = name.lastIndexOf('.');
        String format = separator < 0 ? "" : name.substring(separator + 1).toLowerCase(Locale.ROOT);
        if (!java.util.Set.of("pdf", "docx", "txt").contains(format))
            throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
        return format;
    }

    private static void validateSignature(byte[] bytes, String format) {
        boolean pdf =
                bytes.length >= 5
                        && new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII)
                                .equals("%PDF-");
        boolean zip =
                bytes.length >= 4
                        && bytes[0] == 'P'
                        && bytes[1] == 'K'
                        && bytes[2] == 3
                        && bytes[3] == 4;
        boolean ole =
                bytes.length >= 4
                        && bytes[0] == (byte) 0xD0
                        && bytes[1] == (byte) 0xCF
                        && bytes[2] == 0x11
                        && bytes[3] == (byte) 0xE0;
        if (format.equals("pdf") && !pdf
                || format.equals("docx") && !zip && !ole
                || format.equals("txt") && (pdf || zip || ole))
            throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
    }

    /** Works both with spring-boot:run/test classpaths and the production executable Boot JAR. */
    static java.util.List<String> command(Path input, Path output, String format)
            throws IOException {
        var result = new ArrayList<String>();
        result.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        result.add("-Xmx128m");
        result.add("-XX:MaxMetaspaceSize=96m");
        result.add("-XX:ActiveProcessorCount=1");
        result.add("-XX:+ExitOnOutOfMemoryError");
        result.add("-Djava.awt.headless=true");
        result.add("-Duser.home=" + input.getParent());
        result.add("-Djava.io.tmpdir=" + input.getParent());
        String classpath = System.getProperty("java.class.path");
        if (bootJar(classpath)) {
            result.add("-jar");
            result.add(classpath);
        } else {
            result.add("-cp");
            result.add(classpath);
            result.add("ru.godeck.GoDeckApplication");
        }
        result.add(MaterialExtractionProcess.ARGUMENT);
        result.add(input.toString());
        result.add(output.toString());
        result.add(format);
        result.add("source." + format);
        return result;
    }

    private static boolean bootJar(String classpath) throws IOException {
        if (classpath.contains(File.pathSeparator) || !classpath.endsWith(".jar")) return false;
        try (var jar = new JarFile(classpath)) {
            var manifest = jar.getManifest();
            return manifest != null
                    && "org.springframework.boot.loader.launch.JarLauncher"
                            .equals(manifest.getMainAttributes().getValue("Main-Class"));
        }
    }

    private static void deleteDirectory(Path directory) {
        try (var entries = Files.walk(directory)) {
            for (var file : entries.sorted(java.util.Comparator.reverseOrder()).toList())
                Files.deleteIfExists(file);
        } catch (IOException ignored) {
            // The only target is the privately created extraction directory; never log its
            // contents.
        }
    }
}
