package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** A machine credential (§11) issued for one project, with one role and optionally one locale. */
@Entity
@Table(name = "api_key")
@Getter
@Setter
@NoArgsConstructor
public class ProjectApiKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The public half of the token, what a presented key is looked up by. */
    private String keyId;
    private String secretHash;
    private Long projectId;

    @Enumerated(EnumType.STRING)
    private Role role;

    private String locale;
    private String name;
    private Long createdBy;
    private Instant createdAt = Instant.now();
    private Instant expiresAt;
    private Instant revokedAt;
}
