package dev.relism.glossa.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.relism.flash.ext.data.DataExtension;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Tx;
import dev.relism.flash.ext.data.hibernate.HibernateData;
import dev.relism.flash.ext.data.hibernate.HibernateTxManager;
import dev.relism.glossa.Env;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.AvailableSettings;

import javax.sql.DataSource;

/**
 * Postgres bootstrap — the single persistent datastore (§2 of {@code docs/REQUIREMENTS.md}).
 * Flyway migrates the schema first; Hibernate is then started with {@code hbm2ddl.auto=validate}
 * so drift between migrations and entities fails loudly at boot instead of silently diverging.
 *
 * <p>No entities are mapped yet — the content model is deliberately schema-driven and its tables
 * are still to be designed, so {@link #buildSessionFactory} starts from an empty
 * {@link MetadataSources}. Register each {@code @Entity} there as it lands, alongside its Flyway
 * migration in {@code src/main/resources/db/migration}; {@code validate} then keeps the two in
 * step.
 */
@Slf4j
public final class Database {

    private Database() {}

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

    public static Bootstrap bootstrap() {
        return bootstrap(Env.DB_URL, Env.DB_USERNAME, Env.DB_PASSWORD);
    }

    /** Split out from {@link #bootstrap()} so tests can point at a throwaway Postgres without env vars/{@code .env}. */
    public static Bootstrap bootstrap(String url, String user, String password) {
        log.info("Connecting to {} as {}", url, user);
        DataSource dataSource = hikari(url, user, password);

        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        log.info("Schema migrated");

        SessionFactory sessionFactory = buildSessionFactory(dataSource);
        HibernateTxManager txManager = new HibernateTxManager(sessionFactory);
        Data data = HibernateData.create(txManager);
        return new Bootstrap(new DataExtension(txManager, data), data);
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

    private static SessionFactory buildSessionFactory(DataSource dataSource) {
        StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .applySetting(AvailableSettings.JAKARTA_NON_JTA_DATASOURCE, dataSource)
                .applySetting(AvailableSettings.HBM2DDL_AUTO, "validate")
                .applySetting(AvailableSettings.SHOW_SQL, "false")
                .build();
        try {
            // Add each entity here as it is introduced — see this class's javadoc.
            return new MetadataSources(registry)
                    .buildMetadata()
                    .buildSessionFactory();
        } catch (RuntimeException e) {
            StandardServiceRegistryBuilder.destroy(registry);
            throw e;
        }
    }
}
