package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * §6's terminology: how a term is to be translated, or that it is not to be translated at all.
 * A null {@code locale} is every locale; a null {@code translation} means leave the term as it is.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class GlossaryTerm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long projectId;
    private String term;
    private String locale;
    private String translation;
}
