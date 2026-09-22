package dev.relism.glossa.persistence.entities;

import dev.relism.glossa.content.FieldType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** An immutable value of a variant (§8). A translation names the source revision it was made from. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ContentRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long variantId;
    private Long basedOnSourceRevisionId;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, FieldType.Variable> contract;

    private String actor;
    /** Written with an API key: §9 keeps it from going live without a human. */
    private boolean machine;
    private Instant createdAt = Instant.now();
}
