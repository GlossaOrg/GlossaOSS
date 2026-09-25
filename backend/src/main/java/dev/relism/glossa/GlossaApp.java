package dev.relism.glossa;

import dev.relism.flash.ext.jackson.json.JsonExtension;
import dev.relism.flash.ext.jackson.xml.XmlExtension;
import dev.relism.flash.ext.validation.avaje.AvajeValidationExtension;
import dev.relism.flash.ext.limiter.LimiterExtension;
import dev.relism.flash.ext.openapi.OpenApiExtension;
import dev.relism.flash.ext.openapi.Ui;
import dev.relism.flash.ext.security.RoleResolver;
import dev.relism.flash.ext.security.SecurityExtension;
import dev.relism.flash.ext.security.UserResolver;
import dev.relism.flash.ext.security.form.FormLoginExtension;
import dev.relism.flash.extension.FlashApp;
import dev.relism.flash.extension.FlashApplication;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.persistence.Database;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.service.AiService;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Glossa's whole contribution to a {@link FlashApp} — every extension, route and service —
 * expressed independently of the port it runs on, so {@link Main} and every integration test
 * boot the exact same wiring. See {@code flash-testing}'s {@code FlashTest.of(...)}.
 *
 * <p>Two things are deliberately <em>not</em> here and live in {@link Main} instead, because both
 * need an external resource that no test has: Vite in DEV, or the built frontend otherwise, and
 * {@code OidcExtension} fetches its issuer's discovery document at boot. Everything a test needs
 * to exercise the API is in this class.
 */
public final class GlossaApp implements FlashApplication {

    public static final String VERSION = "0.1.0";

    private final Database.Bootstrap db;
    private final boolean localLogin;
    private final boolean selfAdministered;
    private RoleResolver roles;
    private UserResolver<AppUser> users = principal -> {
        throw new IllegalStateException("No Glossa user for " + principal.getClass().getName());
    };
    private String origin;
    private AiService.Access ai;

    /** Signs in with passwords unless {@link Env#LOCAL_LOGIN} turns it off; whoever signs up or in first administers the install. */
    public GlossaApp(Database.Bootstrap db) {
        this(db, Env.LOCAL_LOGIN, true);
    }

    /**
     * @param selfAdministered whether this installation owns its accounts: the first user administers
     *                         it and everyone else arrives by invitation. Off, nobody administers the
     *                         installation, and accounts are provisioned as their provider vouches for them.
     */
    public GlossaApp(Database.Bootstrap db, boolean localLogin, boolean selfAdministered) {
        this.db = db;
        this.localLogin = localLogin;
        this.selfAdministered = selfAdministered;
        this.roles = new ProjectRoles(db.data());
    }

    /** What {@code @RolesAllowed} is read against. Default: {@link ProjectRoles}. */
    public GlossaApp roles(RoleResolver roles) {
        this.roles = roles;
        return this;
    }

    /** The account behind a principal no mechanism of Glossa's own produced. Its account is still refused if suspended or removed. */
    public GlossaApp users(UserResolver<AppUser> users) {
        this.users = users;
        return this;
    }

    /** Where the installation is served, e.g. {@code https://glossa.example}; {@code null} takes each request's own. */
    public GlossaApp origin(String origin) {
        this.origin = origin;
        return this;
    }

    /** §9: where AI calls may go; {@code null} uses the provider this installation configures for itself. */
    public GlossaApp ai(AiService.Access ai) {
        this.ai = ai;
        return this;
    }

    /**
     * The API reference: Scalar, wearing the application's own palette rather than a preset of its
     * own — see {@code resources/openapi/scalar-theme.css}.
     */
    private static Ui<?> apiReference() {
        try (InputStream theme = GlossaApp.class.getResourceAsStream("/openapi/scalar-theme.css")) {
            return Ui.scalar()
                    .option("withDefaultFonts", false)   // the theme brings the app's own
                    .customCss(new String(theme.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException unreadable) {
            throw new IllegalStateException("Cannot read openapi/scalar-theme.css", unreadable);
        }
    }

    @Override
    public void configure(FlashApp app) {
        JsonExtension json = new JsonExtension();
        GlossaServices services = new GlossaServices(db.data(), localLogin, selfAdministered, users, ai);
        SecurityExtension security = new SecurityExtension().users(services.users()).roles(roles).loginPage("/login");
        if (origin != null) security.origin(origin);
        if (localLogin) app.install(new FormLoginExtension(services.users()));

        app.install(db.extension())
                .install(json)
                // XML for the delivery formats that are XML; only JSON is marshalled automatically.
                .install(new XmlExtension())
                // A body is checked against its own type's rules before a handler sees it.
                .install(new AvajeValidationExtension())
                .install(services)
                // §10: the public delivery API must be rate-limited.
                .install(new LimiterExtension())
                .install(new OpenApiExtension("/openapi", "Glossa API", VERSION).ui(apiReference()))
                // §11: one chain for every strategy — roles are always Glossa's (§8), never a provider's.
                // The SPA's sign-in page lists every way in, so a browser always lands there.
                .install(security)
                .install(services.keys().extension())
                .scan("dev.relism.glossa.api");
    }
}
