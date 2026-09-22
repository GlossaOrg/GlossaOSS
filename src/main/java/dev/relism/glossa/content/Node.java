package dev.relism.glossa.content;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;

/**
 * §3: a payload as the tree an editor works on, so no client has to know a field type's syntax.
 * A type parses to these and composes back from them; {@code node} is what a renderer dispatches on,
 * and a type that needs a shape none of these carry adds it here rather than leaking syntax.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "node")
@JsonSubTypes({
        @JsonSubTypes.Type(value = Node.Text.class, name = "text"),
        @JsonSubTypes.Type(value = Node.Hole.class, name = "hole"),
        @JsonSubTypes.Type(value = Node.Choice.class, name = "choice"),
})
public sealed interface Node {

    /** Literal text, unescaped. */
    record Text(String value) implements Node {}

    /** A variable printed as it is, or through a formatter: {@code {total, number, ::currency/EUR}}. */
    record Hole(String argument, String format, String style) implements Node {}

    /** A variable that picks one of several messages: plural, selectordinal or select. */
    record Choice(String argument, String kind, double offset, List<Branch> branches) implements Node {}

    /** One arm of a {@link Choice}: a CLDR keyword, a select value, {@code other}, or {@code =2}. */
    record Branch(String match, List<Node> body) {}
}
