package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import dev.relism.glossa.persistence.entities.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** §11's API keys: what a manager issues, and what anybody may read back. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Keys {

    @Schema(name = "NewApiKey", description = "A key for one project, with one role it can never exceed.")
    public record KeyRequest(
            @SchemaProperty(description = "What the key is for, so it can be recognised later.", required = true)
            @NotBlank(message = "is required")
            String name,
            @SchemaProperty(description = "The role the key carries. A key inherits nothing from whoever issued it.", required = true)
            @NotNull(message = "is required")
            Role role,
            @SchemaProperty(description = "Confines the key to one locale. Every locale when left out.")
            String locale,
            @SchemaProperty(description = "When it stops working. Never, when left out.")
            Instant expiresAt) {}

    @Schema(name = "ApiKey", description = "An issued key, without its secret.")
    public record KeyView(
            long id,
            String name,
            Role role,
            String locale,
            Instant createdAt,
            Instant expiresAt,
            @SchemaProperty(description = "When it was revoked. Null while it still works.")
            Instant revokedAt) {}

    @Schema(name = "IssuedApiKey", description = "A key and its token. The only answer the token ever appears in.")
    public record IssuedKey(long id, String name, Role role, String locale, String token) {}
}
