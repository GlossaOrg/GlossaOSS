package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import dev.relism.glossa.persistence.entities.Role;
import io.avaje.validation.constraints.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** Projects, which are the widest scope anything is grouped under (§5). */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Projects {

    @Schema(name = "Project", description = "A project and what the caller may do in it.")
    public record ProjectView(
            long id,
            String slug,
            String name,
            @SchemaProperty(description = "The caller's role here, which decides every route scoped to it.")
            Role role) {}

    @Schema(name = "NewProject", description = "A project. The slug is made from the name when not given.")
    @Valid
    public record NewProject(
            @SchemaProperty(description = "Lowercase, in URLs. Derived from the name when left out.")
            String slug,
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            String name) {}
}
