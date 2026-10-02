package dev.relism.glossa.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.relism.flash.ext.data.DataModule;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.hibernate.HibernateData;
import dev.relism.flash.ext.data.hibernate.HibernateTxManager;
import dev.relism.glossa.Env;
import dev.relism.glossa.persistence.entities.AiSettings;
import dev.relism.glossa.persistence.entities.AppSession;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.CatalogRelease;
import dev.relism.glossa.persistence.entities.ContentEvent;
import dev.relism.glossa.persistence.entities.ContentRevision;
import dev.relism.glossa.persistence.entities.ContentVariant;
import dev.relism.glossa.persistence.entities.GlossaryTerm;
import dev.relism.glossa.persistence.entities.Invitation;
import dev.relism.glossa.persistence.entities.LocalCredential;
import dev.relism.glossa.persistence.entities.LocalizedResource;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectApiKey;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import dev.relism.glossa.persistence.entities.ProjectMember;
import dev.relism.glossa.persistence.entities.ResourceComment;
import dev.relism.glossa.persistence.entities.UserIdentity;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.cfg.AvailableSettings;

import java.util.List;
import javax.sql.DataSource;

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
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Database {

    /** Where this repository's own migrations live, and the history table that records them. */
    private static final String CORE_MIGRATIONS = "classpath:db/migration";
    private static final String CORE_HISTORY_TABLE = "flyway_schema_history";

    /** Add each {@code @Entity} here as it is introduced — see this class's javadoc. */
    private static final List<Class<?>> CORE_ENTITIES = List.of(
            AppUser.class, UserIdentity.class, LocalCredential.class, Project.class, ProjectMember.class, ProjectApiKey.class, Invitation.class,
            ProjectLocale.class, LocalizedResource.class, ContentVariant.class, ContentRevision.class, ContentEvent.class, CatalogRelease.class,
            AiSettings.class, GlossaryTerm.class, AppSession.class, ResourceComment.class);

    /**
     * {@code data} is usable before the app starts; {@code module} installs that same transaction
     * runtime and closes its manager with the app.
     */
    public record Bootstrap(DataModule module, Data data) {}

    public static Bootstrap bootstrap() {
        return bootstrap(Env.DB_URL, Env.DB_USERNAME, Env.DB_PASSWORD);
    }

    /** Split out from {@link #bootstrap()} so tests can point at a throwaway Postgres without env vars/{@code .env}. */
    public static Bootstrap bootstrap(String url, String user, String password) {
        log.info("Connecting to {} as {}", url, user);
        DataSource dataSource = hikari(url, user, password);

        migrate(dataSource);
        SessionFactory sessionFactory = buildSessionFactory(dataSource);
        HibernateTxManager txManager = new HibernateTxManager(sessionFactory);
        Data data = HibernateData.create(txManager);
        return new Bootstrap(new DataModule(txManager, data), data);
    }

    private static void migrate(DataSource dataSource) {
        Flyway.configure()
                .dataSource(dataSource)
                .locations(CORE_MIGRATIONS)
                .table(CORE_HISTORY_TABLE)
                .load()
                .migrate();
        log.info("Migrated {} ({})", CORE_MIGRATIONS, CORE_HISTORY_TABLE);
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
                .applySetting(AvailableSettings.PHYSICAL_NAMING_STRATEGY,
                        CamelCaseToUnderscoresNamingStrategy.class.getName())
                .applySetting(AvailableSettings.SHOW_SQL, "false")
                .build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            CORE_ENTITIES.forEach(sources::addAnnotatedClass);
            return sources.buildMetadata().buildSessionFactory();
        } catch (RuntimeException e) {
            StandardServiceRegistryBuilder.destroy(registry);
            throw e;
        }
    }
}
