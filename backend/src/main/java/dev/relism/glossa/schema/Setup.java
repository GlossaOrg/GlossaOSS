package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** The first account of a self-administered install (§11). */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Setup {

    @Schema(name = "Setup", description = "Whether this install still waits for its first user.")
    public record SetupView(boolean firstUser) {}

    @Schema(name = "FirstAccount", description = "The first account, which administers the install. Refused once anyone exists.")
    public record FirstAccount(
            @SchemaProperty(description = "Shown wherever the account appears. The email when left out.")
            String name,
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            @Email(message = "is not an email address")
            String email,
            @SchemaProperty(description = "At least 8 characters, with a capital, a small letter and a special one.", required = true)
            @NotBlank(message = "is required")
            String password) {}
}
