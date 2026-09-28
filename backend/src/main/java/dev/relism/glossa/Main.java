package dev.relism.glossa;

import dev.relism.flash.App;
import dev.relism.flash.Server;
import dev.relism.flash.ServerConfig;
import dev.relism.flash.ext.security.oidc.OidcModule;
import dev.relism.flash.ext.security.oidc.OidcProvider;
import dev.relism.flash.ext.vite.ViteModule;
import dev.relism.glossa.persistence.Database;

import java.nio.file.Path;

/**
 * Production entrypoint. One port serves everything: the React SPA (§12), the admin and public
 * delivery APIs (§10).
 *
 * <p>Only the two externally-dependent modules are installed here; the rest of the app is
 * {@link GlossaApp}, which tests boot unchanged.
 */
public final class Main {

    public static void main(String[] args) {
        // In DEV the module runs Vite itself, and looks for the project where this says:
        // the Maven plugin is told the same path by the build, not by this.
        App app = App.create().install(new ViteModule().root(Path.of("frontend")));
        // Discovery runs at boot, so OIDC is only installed against an issuer that exists.
        if (Env.OIDC_ISSUER != null) {
            app.install(new OidcModule(OidcProvider.of("sso", Env.OIDC_ISSUER, Env.OIDC_CLIENT_ID, Env.OIDC_CLIENT_SECRET)
                    .name("Single sign-on").scopes(Env.OIDC_SCOPES)));
        }
        app.install(new GlossaApp(Database.bootstrap()).origin(Env.ORIGIN));
        Server.start(app, ServerConfig.builder().port(Env.PORT).build()).await();
    }
}
