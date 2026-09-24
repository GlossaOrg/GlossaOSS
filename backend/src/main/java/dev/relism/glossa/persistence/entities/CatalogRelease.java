package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** An immutable published catalog of one project locale (§10), addressed by its content hash. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class CatalogRelease {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long projectId;
    private String locale;
    private String hash;
    private String artifact;
    private Instant createdAt = Instant.now();
}
