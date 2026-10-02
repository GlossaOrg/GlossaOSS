package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** A signed-in session (§11): its principal as JSON, keyed by the SHA-256 of the cookie that names it. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class AppSession {

    @Id
    private String id;

    private String kind;
    private String principal;
    private Instant expiresAt;
}
