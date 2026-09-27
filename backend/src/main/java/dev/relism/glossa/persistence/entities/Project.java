package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** §5's widest scope: everything else, grants included, belongs to one project. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String slug;
    private String name;
    private Instant createdAt = Instant.now();
    /** Called with every new release, or null. */
    private String webhookUrl;
    /** Sealed with {@code Secrets}: Glossa signs with it, so it has to read it back. */
    private String webhookSecret;
}
