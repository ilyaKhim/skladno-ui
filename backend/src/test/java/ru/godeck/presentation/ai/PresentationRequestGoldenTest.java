package ru.godeck.presentation.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Golden snapshot of the primary generation request body.
 *
 * <p>The AI text-edit feature must not change what initial generation sends to the provider: the
 * prompt files, schema, token limit and {@code store} flag are all locked here. An intentional
 * change of the generation request is made by regenerating the snapshot with {@code
 * -Dgodeck.golden.update=true} and reviewing the diff.
 */
class PresentationRequestGoldenTest {
    private static final String SNAPSHOT = "golden/presentation-generation-request.json";
    private static final Path SOURCE_SNAPSHOT =
            Path.of("src", "test", "resources").resolve(SNAPSHOT);
    private final ObjectMapper json =
            tools.jackson.databind.json.JsonMapper.builder()
                    .enable(SerializationFeature.INDENT_OUTPUT)
                    .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                    .build();

    @Test
    void generationRequestBodyMatchesTheSnapshot() throws Exception {
        var fields = new LinkedHashMap<String, Integer>();
        fields.put("TITLE", 44);
        fields.put("SUBTITLE", 110);
        fields.put("STATEMENT", 46);
        var request =
                new PresentationRequestFactory()
                        .create(
                                "Описание шаблона (JSON):\n{\"name\":\"Тест\"}\n\nЗадача"
                                        + " пользователя: GoDeck для отделов продаж",
                                fields,
                                List.of(
                                        slide(1, List.of("TITLE", "SUBTITLE")),
                                        slide(3, List.of("STATEMENT"))),
                                "gpt-6.1-sol");
        String actual = lf(json.writeValueAsString(json.valueToTree(request)));
        if (Boolean.getBoolean("godeck.golden.update")) {
            Files.createDirectories(SOURCE_SNAPSHOT.getParent());
            Files.writeString(SOURCE_SNAPSHOT, actual + "\n", StandardCharsets.UTF_8);
            return;
        }
        String expected;
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(SNAPSHOT)) {
            assertThat(input).as("snapshot " + SNAPSHOT).isNotNull();
            expected = lf(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        JsonNode actualTree = json.readTree(actual);
        assertThat(actualTree).isEqualTo(json.readTree(expected));
    }

    /** Ordered manifest entry: the brief embeds its {@code toString()}, so order must be fixed. */
    private static Map<String, Object> slide(int number, List<String> fields) {
        var slide = new LinkedHashMap<String, Object>();
        slide.put("slide", number);
        slide.put("fields", fields);
        return slide;
    }

    /**
     * Prompt resources are stored with LF in Git, but a Windows checkout with {@code core.autocrlf}
     * turns them into CRLF. The snapshot compares content, not the platform's line endings.
     */
    private static String lf(String serializedJson) {
        return serializedJson.replace("\\r\\n", "\\n");
    }
}
