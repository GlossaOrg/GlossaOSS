package dev.relism.glossa.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.relism.flash.ext.data.DataExtension;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Tx;
import dev.relism.flash.ext.data.hibernate.HibernateData;
import dev.relism.flash.ext.data.hibernate.HibernateTxManager;
import dev.relism.glossa.Env;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.Invitation;
import dev.relism.glossa.persistence.entities.LocalCredential;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectApiKey;
import dev.relism.glossa.persistence.entities.ProjectMember;
import dev.relism.glossa.persistence.entities.UserIdentity;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy;
import org.hibernate.cfg.AvailableSettings;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Postgres bootstrap — the single persistent datastore (§2 of {@code docs/REQUIREMENTS.md}).
 * Flyway migrates the schema first; Hibernate is then started with {@code hbm2ddl.auto=validate}
 * so drift between migrations and entities fails loudly at boot instead of silently diverging.
 *
 * <p>Register each {@code @Entity} in {@link #CORE_ENTITIES} as it lands, alongside its Flyway
 * migration in {@code src/main/resources/db/migration}; {@code validate} then keeps the two in
 * step. Column names are derived from field names by Hibernate's camelCase-to-underscores naming
 * strategy, so {@code createdAt} maps to {@code created_at} without an {@code @Column} on it.
 */
@Slf4j
public final class Database {

    /** Where this repository's own migrations live, and the history table that records them. */
    private static final String CORE_MIGRATIONS = "classpath:db/migration";
    private static final String CORE_HISTORY_TABLE = "flyway_schema_history";

    /** Add each {@code @Entity} here as it is introduced — see this class's javadoc. */
    private static final List<Class<?>> CORE_ENTITIES =
            List.of(AppUser.class, UserIdentity.class, LocalCredential.class, Project.class, ProjectMember.class, ProjectApiKey.class, Invitation.class);

    private Database() {}

    /**
     * Schema a module built on top of this one adds: its migrations, and the entities they create.
     *
     * <p>{@code historyTable} is not optional and may not be the core's. Flyway's
     * {@code classpath:} locations are scanned across every classpath entry and merged into one
     * ordered sequence, so a downstream module sharing this repository's history table shares its
     * version numbers too — its migrations sort above the core's, and every core migration added
     * afterwards is then rejected as out-of-order. A separate location with a separate history
     * table keeps the two sequences independent, which is the only arrangement in which both sides
     * can keep adding migrations forever.
     *
     * <p>The core migrates first, so a layer's tables may reference the core's.
     */
    public record Layer(String migrationLocation, String historyTable, List<Class<?>> entities) {
        public Layer {
            Objects.requireNonNull(migrationLocation, "migrationLocation");
            Objects.requireNonNull(historyTable, "historyTable");
            if (CORE_HISTORY_TABLE.equals(historyTable)) {
                throw new IllegalArgumentException("A layer needs its own history table — sharing "
                        + CORE_HISTORY_TABLE + " puts its migrations in the core's version sequence.");
            }
            entities = List.copyOf(entities);
        }
    }

    /**
     * {@code tx} is usable immediately, independent of installing {@code extension} on a
     * {@link dev.relism.flash.extension.FlashApp} — {@code Tx}'s transaction stack is a static
     * thread-local keyed by thread, not by instance (see {@code Tx} in flash-ext-data-core), so
     * building one here and a separate one inside {@link DataExtension} for the same
     * {@code TxManager} is safe and behaves identically. This lets callers run queries before
     * {@code .start()}, which matters because routes must be registered before {@code .start()}
     * compiles them into the FSM router.
     */
    public record Bootstrap(DataExtension extension, Data data) {
        public Tx tx() { return data.tx(); }
    }

    public static Bootstrap bootstrap(Layer... layers) {
        return bootstrap(Env.DB_URL, Env.DB_USERNAME, Env.DB_PASSWORD, layers);
    }

    /** Split out from {@link #bootstrap(Layer...)} so tests can point at a throwaway Postgres without env vars/{@code .env}. */
    public static Bootstrap bootstrap(String url, String user, String password, Layer... layers) {
        log.info("Connecting to {} as {}", url, user);
        DataSource dataSource = hikari(url, user, password);

        migrate(dataSource, CORE_MIGRATIONS, CORE_HISTORY_TABLE, false);
        for (Layer layer : layers) {
            migrate(dataSource, layer.migrationLocation(), layer.historyTable(), true);
        }

        List<Class<?>> entities = new ArrayList<>(CORE_ENTITIES);
        for (Layer layer : layers) {
            entities.addAll(layer.entities());
        }

        SessionFactory sessionFactory = buildSessionFactory(dataSource, entities);
        HibernateTxManager txManager = new HibernateTxManager(sessionFactory);
        Data data = HibernateData.create(txManager);
        return new Bootstrap(new DataExtension(txManager, data), data);
    }

    /**
     * {@code baseline} is on for layers and off for the core, and the difference is not cosmetic.
     * A layer always runs second, into a schema the core has just populated — and Flyway refuses to
     * create a missing history table in a non-empty schema ("Found non-empty schema(s) but no
     * schema history table"), because for a first-ever run that normally means it is about to
     * migrate somebody's hand-built database. Here it means nothing of the sort, so the layer
     * baselines. {@code baselineVersion} must be {@code 0} and not Flyway's default of {@code 1}:
     * a baseline at 1 marks everything up to and including {@code V1__} as already applied, which
     * would silently skip a layer's first migration.
     *
     * <p>The core keeps the default behaviour — its schema is empty on a first run, so pointing it
     * at a database that is not empty is a real error and stays one.
     */
    private static void migrate(DataSource dataSource, String location, String historyTable, boolean baseline) {
        Flyway.configure()
                .dataSource(dataSource)
                .locations(location)
                .table(historyTable)
                .baselineOnMigrate(baseline)
                .baselineVersion("0")
                .load()
                .migrate();
        log.info("Migrated {} ({})", location, historyTable);
    }

    private static DataSource hikari(String url, String user, String password) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(user);
        config.setPassword(password);
        config.setPoolName("glossa-db");
        config.setMaximumPoolSize(10);
        return new HikariDataSource(config);
    }

    private static SessionFactory buildSessionFactory(DataSource dataSource, List<Class<?>> entities) {
        StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .applySetting(AvailableSettings.JAKARTA_NON_JTA_DATASOURCE, dataSource)
                .applySetting(AvailableSettings.HBM2DDL_AUTO, "validate")
                .applySetting(AvailableSettings.PHYSICAL_NAMING_STRATEGY,
                        CamelCaseToUnderscoresNamingStrategy.class.getName())
                .applySetting(AvailableSettings.SHOW_SQL, "false")
                .build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            entities.forEach(sources::addAnnotatedClass);
            return sources.buildMetadata().buildSessionFactory();
        } catch (RuntimeException e) {
            StandardServiceRegistryBuilder.destroy(registry);
            throw e;
        }
    }
}
