package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One locale of a resource, pointing at its latest, approved and pending revisions. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ContentVariant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long resourceId;
    private Long projectId;
    private String locale;
    private Long headRevisionId;
    private Long approvedRevisionId;
    private Long pendingRevisionId;
}
