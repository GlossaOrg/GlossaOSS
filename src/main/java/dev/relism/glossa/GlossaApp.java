package dev.relism.glossa;

import dev.relism.flash.ext.cache.caffeine.CaffeineCacheExtension;
import dev.relism.flash.ext.jackson.JacksonExtension;
import dev.relism.flash.ext.limiter.LimiterExtension;
import dev.relism.flash.ext.mcp.McpConfig;
import dev.relism.flash.ext.mcp.McpExtension;
import dev.relism.flash.ext.openapi.OpenApiExtension;
import dev.relism.flash.ext.scheduler.SchedulerExtension;
import dev.relism.flash.ext.security.RoleResolver;
import dev.relism.flash.ext.security.SecurityExtension;
import dev.relism.flash.ext.security.form.FormLoginExtension;
import dev.relism.flash.ext.validation.ValidationExtension;
import dev.relism.flash.extension.FlashApp;
import dev.relism.flash.extension.FlashApplication;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.persistence.Database;

/**
 * Glossa's whole contribution to a {@link FlashApp} — every extension, route and service —
 * expressed independently of the port it runs on, so {@link Main} and every integration test
 * boot the exact same wiring. See {@code flash-testing}'s {@code FlashTest.of(...)}.
 *
 * <p>Two things are deliberately <em>not</em> here and live in {@link Main} instead, because both
 * need an external resource that no test has: the web bundler needs a built {@code web/dist}, and
 * {@code OidcExtension} fetches its issuer's discovery document at boot. Everything a test needs
 * to exercise the API is in this class.
 */
public final class GlossaApp implements FlashApplication {

    public static final String VERSION = "0.1.0";

    private final Database.Bootstrap db;
    private final boolean localLogin;
    private final boolean selfAdministered;
    private final RoleResolver roles;

    /** Signs in with passwords unless {@link Env#LOCAL_LOGIN} turns it off; whoever signs up or in first administers the install. */
    public GlossaApp(Database.Bootstrap db) {
        this(db, Env.LOCAL_LOGIN, true);
    }

    /**
     * @param selfAdministered whether this installation owns its accounts: the first user administers
     *                         it and everyone else arrives by invitation. Off where one install serves
     *                         unrelated tenants — none of whom may administer the others, so no
     *                         administrator exists to invite anyone and accounts are provisioned as
     *                         their provider vouches for them.
     */
    public GlossaApp(Database.Bootstrap db, boolean localLogin, boolean selfAdministered) {
        this(db, localLogin, selfAdministered, null);
    }

    /**
     * @param roles what {@code @RolesAllowed} is read against, {@link ProjectRoles} when null. An
     *              installation serving several tenants answers {@code ADMINISTRATOR} from whichever
     *              of them the request is in, which is why this is a parameter and not a constant.
     */
    public GlossaApp(Database.Bootstrap db, boolean localLogin, boolean selfAdministered, RoleResolver roles) {
        this.db = db;
        this.localLogin = localLogin;
        this.selfAdministered = selfAdministered;
        this.roles = roles == null ? new ProjectRoles(db.data()) : roles;
    }

    @Override
    public void configure(FlashApp app) {
        JacksonExtension jackson = new JacksonExtension();
        GlossaServices services = new GlossaServices(db.data(), localLogin, selfAdministered);
        if (localLogin) app.install(new FormLoginExtension(services.users()));

        app.install(db.extension())
                .install(jackson)
                .install(services)
                .install(new ValidationExtension())
                // §10: delivery responses must be cheaply re-fetchable; §6: glossary and
                // translation-memory lookups are read-mostly and shared across requests.
                .install(new CaffeineCacheExtension())
                // §9: LibreTranslate suggestions run in the background, never on the request path.
                .install(new SchedulerExtension())
                // §10: the public delivery API must be rate-limited.
                .install(new LimiterExtension())
                .install(new OpenApiExtension("/openapi", "Glossa API", VERSION))
                // §11: one chain for every strategy — roles are always Glossa's (§8), never a provider's.
                .install(new SecurityExtension().users(services.users()).roles(roles))
                .install(services.keys().extension())
                // §12: MCP is a core capability, authenticated like every other route.
                .install(new McpExtension(McpConfig.builder("glossa").version(VERSION).toolsPackage("dev.relism.glossa.mcp").build()))
                .use(jackson.autoJson())
                .scan("dev.relism.glossa.api");
    }
}
