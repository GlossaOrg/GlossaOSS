package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** An entry of a resource's append-only change log (§8). */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ContentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long resourceId;
    private Long revisionId;
    private Long beforeRevisionId;
    private Long afterRevisionId;
    private String action;
    private String actor;
    private Instant createdAt = Instant.now();
}
