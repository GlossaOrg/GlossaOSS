package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * One row per person, whichever strategy authenticated them: the ways in are {@link UserIdentity}
 * rows, and an account may hold several. Email is what identifies the person across providers, so
 * it is unique among live accounts (V5) — and an identity is only ever attached to an account on a
 * {@code email_verified} address.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    public static AppUser of(String email, String name, boolean admin) {
        AppUser user = new AppUser();
        user.setEmail(email);
        user.setName(name);
        user.setAdmin(admin);
        return user;
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;
    private String name;

    /** Install administrator: creates users and issues keys anywhere. Never set in the hosted edition. */
    private boolean admin;

    private Instant createdAt = Instant.now();

    /** Suspended: the account exists and can be let back in. */
    private Instant disabledAt;

    /** Removed: the row stays, so the change log (§8) still has someone to attribute to. */
    private Instant deletedAt;

    /** An administrator retired the password: the account chooses a new one before it does anything else. */
    private Instant passwordResetAt;
}
