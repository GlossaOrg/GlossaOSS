package dev.relism.glossa.support;

import dev.relism.glossa.persistence.Database;
import org.testcontainers.containers.PostgreSQLContainer;

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

    public static Database.Bootstrap bootstrap() {
        return Database.bootstrap(CONTAINER.getJdbcUrl(), CONTAINER.getUsername(), CONTAINER.getPassword());
    }
}
