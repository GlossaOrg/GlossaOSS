package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * §9's prompts, as files under {@code resources/prompts} rather than string literals: they are long,
 * they are edited far more often than the code around them, and a diff on one should read as prose.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Prompts {

    private static final Map<String, String> TEMPLATES = new ConcurrentHashMap<>();

    /** {@code prompts/<name>.md} with each {@code {{placeholder}}} replaced by its value. */
    public static String render(String name, Map<String, String> values) {
        String prompt = TEMPLATES.computeIfAbsent(name, Prompts::load);
        for (Map.Entry<String, String> value : values.entrySet()) {
            prompt = prompt.replace("{{" + value.getKey() + "}}", value.getValue());
        }
        return prompt;
    }

    private static String load(String name) {
        try (InputStream file = Prompts.class.getResourceAsStream("/prompts/" + name + ".md")) {
            if (file == null) throw HttpException.internal("Missing prompt: " + name + ".");
            return new String(file.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw HttpException.internal("Could not read prompt: " + name + ".");
        }
    }
}
