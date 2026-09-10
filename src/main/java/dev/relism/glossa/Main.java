package dev.relism.glossa;

import dev.relism.flash.Flash;
import dev.relism.flash.ext.oidc.OidcConfig;
import dev.relism.flash.ext.oidc.OidcExtension;
import dev.relism.flash.ext.webbundler.OperationMode;
import dev.relism.flash.ext.webbundler.PackageManager;
import dev.relism.flash.ext.webbundler.RuntimeMode;
import dev.relism.flash.ext.webbundler.WebBundlerConfig;
import dev.relism.flash.ext.webbundler.WebBundlerExtension;
import dev.relism.flash.extension.FlashApp;
import dev.relism.glossa.persistence.Database;
import lombok.extern.slf4j.Slf4j;

import java.nio.file.Path;

/**
 * Production entrypoint. One port serves everything: the React SPA (§13), the admin and public
 * delivery APIs (§10), and {@code /mcp} (§12).
 *
 * <p>Only the two externally-dependent extensions are installed here; the rest of the app is
 * {@link GlossaApp}, which tests boot unchanged.
 */
@Slf4j
public final class Main {

    public static void main(String[] args) {
        FlashApp app = FlashApp.create(Env.PORT)
                .install(new WebBundlerExtension(webBundlerConfig()));

        // §11 makes SSO mandatory in a real deployment, but a fresh clone has no identity
        // provider — and OidcExtension fetches the issuer's discovery document at boot, so
        // installing it against a placeholder issuer fails the whole app. Install order matters:
        // this must precede GlossaApp's McpExtension, which auto-detects OidcCredentialSource and
        // derives its RFC 8707/RFC 9728 OAuth2 configuration from it.
        if (Env.OIDC_ISSUER == null) {
            log.warn("OIDC_ISSUER is unset — starting with authentication disabled. "
                    + "Set the OIDC_* variables (see .env.example) before deploying.");
        } else {
            app.install(new OidcExtension(OidcConfig
                    .builder(Env.OIDC_ISSUER, Env.OIDC_CLIENT_ID, Env.OIDC_CLIENT_SECRET, Env.OIDC_REDIRECT_URI)
                    .scopes(Env.OIDC_SCOPES)
                    .routePrefix(Env.OIDC_ROUTE_PREFIX)
                    .selfScheme(Env.OIDC_SELF_SCHEME)
                    .rolesClaimPath(Env.OIDC_ROLES_CLAIM)
                    .build()));
        }

        app.apply(new GlossaApp(Database.bootstrap()))
                .startAndBlock();
    }

    /**
     * DEV ({@code -Dflash.env=dev} / {@code FLASH_ENV=dev}) orchestrates the Vite dev server
     * against {@code web/} on the filesystem. Everything else — the Docker image included, which
     * never sets {@code FLASH_ENV} — serves the frontend from the classpath, where the Docker
     * build has already embedded {@code web/dist} plus the manifest {@code WebBundlerBuild}
     * generates (see the {@code docker} Maven profile in pom.xml and the Dockerfile). Classpath
     * assets are explicitly unsupported in DEV, so this cannot be one config with a runtime-only
     * switch — the two need different {@code assetsSource} wiring.
     */
    private static WebBundlerConfig webBundlerConfig() {
        if (Flash.DEV) {
            return WebBundlerConfig.builder()
                    .webRoot(Path.of("web"))
                    .basePath("/")
                    .operationMode(OperationMode.MANAGED)
                    .assetsFromFilesystem(Path.of("dist"))
                    .packageManager(PackageManager.PNPM)
                    .build();
        }
        return WebBundlerConfig.builder()
                .basePath("/")
                .runtimeMode(RuntimeMode.PROD)
                .operationMode(OperationMode.MANAGED)
                .assetsFromClasspath("web/dist")
                .build();
    }
}
