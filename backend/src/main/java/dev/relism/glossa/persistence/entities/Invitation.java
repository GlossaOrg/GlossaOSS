package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** An administrator's standing offer of an account (§11), with the grant it starts with and, for a password account, its one-time link. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Invitation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;
    private String name;

    /** Set when this is a password reset for an account that already exists. */
    private Long userId;

    private Long projectId;

    @Enumerated(EnumType.STRING)
    private Role role;

    private String locale;

    /** True when the account will sign in through the identity provider, which leaves no link to hand out. */
    private boolean sso;

    private String keyId;
    private String secretHash;
    private Instant expiresAt;
    private Instant acceptedAt;
    private Long createdBy;
    private Instant createdAt = Instant.now();
}
