package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import dev.relism.glossa.persistence.entities.Role;
import io.avaje.validation.constraints.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/** Accounts, invitations and what a person may do where (§8, §11). */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Users {

    /** Where an account stands. An invitation is a row like any other until it is taken up. */
    public enum Status { ACTIVE, INVITED, DISABLED, DELETED }

    @Schema(name = "Account", description = "A row of the user table: an account, or an invitation nobody has taken up yet.")
    public record AccountView(
            long id,
            @SchemaProperty(description = "True while this is an invitation and not an account.")
            boolean invitation,
            String name,
            String email,
            @SchemaProperty(description = "Where this person can sign in from: a password, or an identity provider.")
            List<String> sources,
            @SchemaProperty(description = "Administers the install: every account and every project.")
            boolean administrator,
            Status status,
            @SchemaProperty(description = "The password was retired, so the next sign-in must choose a new one.")
            boolean passwordReset,
            Instant createdAt,
            @SchemaProperty(description = "When the invitation stops working. Null when it never does.")
            Instant expiresAt,
            List<Membership> projects) {}

    @Schema(name = "Membership", description = "A role in one project, optionally confined to one locale.")
    public record Membership(long project, String name, Role role, String locale) {}

    @Schema(name = "Invitation", description = "Invites an address. Nobody signs themselves up (§11).")
    @Valid
    public record InviteRequest(
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            @Email(message = "is not an email address")
            String email,
            String name,
            @SchemaProperty(description = "The person signs in through the identity provider instead of choosing a password.")
            boolean sso,
            @SchemaProperty(description = "Gives them a role in this project straight away.")
            Long project,
            Role role,
            @SchemaProperty(description = "Confines that role to one locale.")
            String locale,
            @SchemaProperty(description = "How long the link works for. 0 never expires.")
            int expiresInDays) {}

    @Schema(name = "Invited", description = "An invitation and its link. The only answer the link ever appears in.")
    public record Invited(long id, String email, String link) {}

    @Schema(name = "InvitationDetail", description = "What the invited person is shown before choosing a password.")
    public record InviteView(
            String email,
            String name,
            @SchemaProperty(description = "True when this is a password reset rather than a first invitation.")
            boolean reset) {}

    @Schema(name = "Chosen", description = "The password the invited person chose, and the name they go by.")
    @Valid
    public record Chosen(
            String name,
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            String password) {}

    @Schema(name = "Accepted", description = "Who the account turned out to be, so a browser can sign in with what was just chosen.")
    public record Accepted(String email) {}

    @Schema(name = "Me", description = "The signed-in account, as the frontend needs it.")
    public record MeView(
            long id,
            String email,
            String name,
            @SchemaProperty(description = "Administers the install. False wherever the install administers nobody.")
            boolean admin,
            @SchemaProperty(description = "The password was retired: every route but this one is refused until it changes.")
            boolean mustChangePassword) {}

    @Schema(name = "NewPassword", description = "A password to replace the current one. It must differ from it.")
    @Valid
    public record NewPassword(
            @SchemaProperty(required = true)
            @NotBlank(message = "is required")
            String password) {}
}
