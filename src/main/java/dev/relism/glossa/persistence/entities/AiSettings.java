package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** §9: the installation's AI provider, one row created by the migration. {@code apiKey} is encrypted. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class AiSettings {

    /** The only row there is. */
    public static final short ROW = 1;

    @Id
    private Short id;

    private boolean enabled;
    private String baseUrl;
    private String apiKey;
    private String model;
}
