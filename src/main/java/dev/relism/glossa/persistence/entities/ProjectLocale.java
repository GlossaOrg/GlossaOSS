package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A locale enabled on a project (§5): its one source, or a target with an optional fallback. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ProjectLocale {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long projectId;
    private String locale;
    private boolean source;
    private String fallbackLocale;
}
