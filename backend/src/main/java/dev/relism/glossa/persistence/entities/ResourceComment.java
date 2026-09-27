package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** One message of the thread about a resource in one locale. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ResourceComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long projectId;
    private Long resourceId;
    private String locale;
    private String author;
    private String body;
    private Instant createdAt = Instant.now();
}
