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
 * A way of signing in to one {@link AppUser}: {@code issuer} is the OIDC issuer or {@link #LOCAL},
 * {@code subject} the {@code sub} claim or the local email. One account may hold several (§11), so
 * a person whose employer turns on SSO keeps the account they already had.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class UserIdentity {

    /** The {@code issuer} of a credential Glossa itself holds rather than an identity provider. */
    public static final String LOCAL = "local";

    public static UserIdentity of(long userId, String issuer, String subject) {
        UserIdentity identity = new UserIdentity();
        identity.setUserId(userId);
        identity.setIssuer(issuer);
        identity.setSubject(subject);
        return identity;
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String issuer;
    private String subject;
    private Instant createdAt = Instant.now();
}
