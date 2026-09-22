package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A localizable resource (§3, §5): a key unique in its project and the field type of its values. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class LocalizedResource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long projectId;
    private String key;
    private String fieldType;
    private String context;
    private boolean archived;
}
