package dev.relism.glossa;

import dev.relism.flash.ext.security.oidc.OidcExtension;
import dev.relism.flash.ext.security.oidc.OidcProvider;
import dev.relism.flash.ext.vite.ViteExtension;
import dev.relism.flash.extension.FlashApp;
import dev.relism.glossa.persistence.Database;

import java.nio.file.Path;

/**
 * Production entrypoint. One port serves everything: the React SPA (§12), the admin and public
 * delivery APIs (§10).
 *
 * <p>Only the two externally-dependent extensions are installed here; the rest of the app is
 * {@link GlossaApp}, which tests boot unchanged.
 */
public final class Main {

    public static void main(String[] args) {
        // In DEV the extension runs Vite itself, and looks for the project where this says:
        // the Maven plugin is told the same path by the build, not by this.
        FlashApp app = FlashApp.create(Env.PORT).install(new ViteExtension().root(Path.of("frontend")));
        // Discovery runs at boot, so OIDC is only installed against an issuer that exists.
        if (Env.OIDC_ISSUER != null) {
            app.install(new OidcExtension(OidcProvider.of("sso", Env.OIDC_ISSUER, Env.OIDC_CLIENT_ID, Env.OIDC_CLIENT_SECRET)
                    .name("Single sign-on").scopes(Env.OIDC_SCOPES)));
        }
        app.apply(new GlossaApp(Database.bootstrap()).origin(Env.ORIGIN)).startAndBlock();
    }
}
