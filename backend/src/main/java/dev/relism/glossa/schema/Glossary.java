package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** §6's terminology: what a term must become, or must never become. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Glossary {

    @Schema(name = "GlossaryTerm", description = "A term and what it is to become in one locale.")
    public record TermView(
            long id,
            String term,
            @SchemaProperty(description = "The locale it binds. Null binds every locale.")
            String locale,
            @SchemaProperty(description = "What to translate it to. Null means leave the term as it is.")
            String translation) {}

    @Schema(name = "NewGlossaryTerm", description = "Adds a term or replaces what it says. One term per locale.")
    public record NewTerm(
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            @Size(max = 255, message = "is up to 255 characters")
            String term,
            @SchemaProperty(description = "Binds one locale. Every locale when left out.")
            String locale,
            @SchemaProperty(description = "Left out, the term is to be kept as it is wherever it appears.")
            String translation) {}
}
