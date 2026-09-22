package dev.relism.glossa.support;

import dev.relism.glossa.persistence.Database;
import org.testcontainers.containers.PostgreSQLContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * One throwaway Postgres shared by every test class in the JVM.
 *
 * <p>Deliberately started from a static initializer rather than through {@code @Container}: a
 * {@code @RegisterExtension static FlashTest} field is initialized during class init, which
 * happens <em>before</em> the Testcontainers JUnit extension would start an {@code @Container}
 * field — so a test that boots the app against the database in a field initializer would race it.
 * Starting the container here removes the ordering question entirely, and Ryuk still reaps it
 * when the JVM exits.
 *
 * <p>A container start costs seconds, so it is shared rather than per-class. Nothing in a test
 * may therefore assume it owns the schema — give each test its own rows.
 */
public final class Postgres {

    private static final PostgreSQLContainer<?> CONTAINER = new PostgreSQLContainer<>("postgres:16");

    static {
        CONTAINER.start();
    }

    private Postgres() {}

    public static Database.Bootstrap bootstrap(Database.Layer... layers) {
        return Database.bootstrap(CONTAINER.getJdbcUrl(), CONTAINER.getUsername(), CONTAINER.getPassword(), layers);
    }

    /** A database of its own in the shared container, for a test that needs to start from no rows at all. */
    public static Database.Bootstrap fresh(String name) {
        try (Connection connection = connection()) {
            connection.createStatement().execute("create database " + name);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        return Database.bootstrap(url(name), CONTAINER.getUsername(), CONTAINER.getPassword());
    }

    /** For asserting on what a migration actually did — the schema, not the app's view of it. */
    public static Connection connection() throws SQLException {
        return connection(CONTAINER.getDatabaseName());
    }

    /** The same, in a database made by {@link #fresh(String)}. */
    public static Connection connection(String database) throws SQLException {
        return DriverManager.getConnection(url(database), CONTAINER.getUsername(), CONTAINER.getPassword());
    }

    private static String url(String database) {
        return CONTAINER.getJdbcUrl().replace("/" + CONTAINER.getDatabaseName(), "/" + database);
    }
}
