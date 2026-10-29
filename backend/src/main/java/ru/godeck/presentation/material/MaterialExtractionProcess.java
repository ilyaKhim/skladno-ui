package ru.godeck.presentation.material;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Local helper entry point, not an HTTP/debug API. Starting no Spring context avoids DB access and
 * lets the parent enforce a real wall-clock and heap limit on hostile document parsers.
 */
public final class MaterialExtractionProcess {
    public static final String ARGUMENT = "--godeck-extract-material";

    private MaterialExtractionProcess() {}

    /**
     * Writes a bounded result or stable error code to the parent-owned path, never to console logs.
     */
    public static void run(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("Invalid extraction arguments");
        var json = new ObjectMapper();
        Object output;
        try {
            output = MaterialParser.extract(Path.of(args[1]), args[3], args[4]);
        } catch (GenerationException known) {
            output = Map.of("error", known.code());
        } catch (Exception | LinkageError | StackOverflowError failure) {
            output = Map.of("error", GenerationError.SOURCE_INVALID.code());
        }
        Files.write(Path.of(args[2]), json.writeValueAsBytes(output));
    }
}
