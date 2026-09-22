package dev.relism.glossa.content;

import java.util.List;
import java.util.Map;

/** §3's extension point: one kind of localizable value, validated and rendered by the type that owns it. */
public interface FieldType {

    enum VariableType { TEXT, NUMBER, TEMPORAL, SELECT, BOOLEAN }

    /** A runtime argument a value may use; only a {@link VariableType#SELECT} declares {@code values}. */
    record Variable(VariableType type, List<String> values) {
        public Variable {
            values = values == null ? List.of() : List.copyOf(values);
        }
    }

    String name();

    /** The contract {@code payload} implies, for a caller that declares its variables by writing them (§3). */
    Map<String, Variable> contractOf(Map<String, Object> payload);

    /** The payload as an editable tree, and back: the pair a visual editor lives on. */
    List<Node> structureOf(Map<String, Object> payload, String locale);

    Map<String, Object> payloadOf(List<Node> nodes);

    /** {@code complete} adds what publication requires on top of what saving does. */
    void validate(Map<String, Object> payload, Map<String, Variable> contract, String locale, boolean complete);

    String render(Map<String, Object> payload, Map<String, Variable> contract, String locale, Map<String, Object> values);
}
