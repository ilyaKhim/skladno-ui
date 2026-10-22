package ru.godeck.presentation.ai;

import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public final class PresentationPrompts {
    private static final String INSTRUCTIONS = read("presentation-instructions.txt");
    private static final String BRIEF = read("presentation-brief.txt");
    private static final String EDIT = read("presentation-edit.txt");

    private PresentationPrompts() {}

    public static String instructions() {
        return INSTRUCTIONS;
    }

    public static String brief(
            String topic, Map<String, Integer> fields, List<Map<String, Object>> slides) {
        return BRIEF.formatted(fields, slides, topic);
    }

    public static String edit(String topic, String content, String message) {
        return EDIT.formatted(topic, content, message);
    }

    private static String read(String file) {
        try (var stream = new ClassPathResource("prompts/" + file).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
