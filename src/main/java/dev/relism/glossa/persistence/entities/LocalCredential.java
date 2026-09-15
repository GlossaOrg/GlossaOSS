package dev.relism.glossa.persistence.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** The password of an {@link AppUser} authenticated by Glossa itself. See {@link Passwords}. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class LocalCredential {

    @Id
    private Long userId;

    private String passwordHash;
    private Instant updatedAt = Instant.now();
}
