package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import dev.relism.glossa.persistence.entities.Role;
import io.avaje.validation.constraints.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    @Schema(name = "Webhook", description = "Where a new release is announced, signed with the secret in X-Glossa-Signature.")
    public record WebhookView(
            String url,
            @SchemaProperty(description = "Only in the answer that sets the URL; never shown again.")
            String secret) {}

    @Schema(name = "WebhookUpdate", description = "A URL to announce releases to, or null to stop. Each new URL gets a new secret.")
    @Valid
    public record WebhookUpdate(
            @Size(max = 2000, message = "stays under 2001 characters")
            String url) {}
}
