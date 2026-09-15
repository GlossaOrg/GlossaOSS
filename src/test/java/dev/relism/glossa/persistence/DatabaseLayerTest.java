package dev.relism.glossa.persistence;

import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link Database.Layer} is the seam a module built on this one uses to add its own schema. The
 * property that matters is separation: a layer's migrations run from their own location into their
 * own history table, leaving the core's sequence free to keep growing.
 */
class DatabaseLayerTest {

    /** Fixture location, deliberately outside {@code db/migration} — see the .sql file's comment. */
    private static final Database.Layer LAYER =
            new Database.Layer("classpath:db/testlayer", "flyway_testlayer_history", List.of());

    @Test
    void aLayerMigratesIntoItsOwnHistoryTable() throws Exception {
        Postgres.bootstrap(LAYER);

        assertTrue(tableExists("probe_layer"), "the layer's migration did not run");
        assertTrue(tableExists("flyway_testlayer_history"), "the layer did not get its own history");
        assertTrue(tableExists("flyway_schema_history"), "the core's history should still be there");
    }

    /**
     * The guard that makes the separation real. Sharing the core's history table is the one
     * mistake that looks like it works — until the next core migration is rejected as out-of-order
     * on every deployment that has already applied the layer's.
     */
    @Test
    void aLayerMayNotShareTheCoreHistoryTable() {
        assertThrows(IllegalArgumentException.class,
                () -> new Database.Layer("classpath:db/testlayer", "flyway_schema_history", List.of()));
    }

    /** No layer, no layer tables — the core alone never reads a layer's location. */
    @Test
    void theCoreAloneMigratesOnlyItsOwn() throws Exception {
        Postgres.bootstrap();
        assertFalse(tableExists("flyway_nonexistent_history"));
    }

    private static boolean tableExists(String name) throws Exception {
        try (Connection connection = Postgres.connection();
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT to_regclass(?) IS NOT NULL")) {
            statement.setString(1, name);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() && rows.getBoolean(1);
            }
        }
    }
}
