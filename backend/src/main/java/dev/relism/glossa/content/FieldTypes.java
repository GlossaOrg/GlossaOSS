package dev.relism.glossa.content;

import dev.relism.flash.http.HttpException;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * §3's registry — the extension point the requirements ask for, and the only one. A second field
 * type is one more entry here and nothing else; content schemas stay data.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class FieldTypes {

    /** Field types hold no per-request state, so one instance of each serves the whole installation. */
    public static final MessageType MESSAGE = new MessageType();

    private static final Map<String, FieldType> BY_NAME = Map.of(MESSAGE.name(), MESSAGE);

    public static FieldType named(String name) {
        FieldType type = name == null ? null : BY_NAME.get(name);
        if (type == null) throw HttpException.badRequest("Unknown field type: " + name + ".");
        return type;
    }
}
