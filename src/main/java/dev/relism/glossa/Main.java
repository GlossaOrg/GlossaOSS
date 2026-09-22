package dev.relism.glossa;

import dev.relism.flash.Flash;
import dev.relism.flash.ext.security.oidc.OidcExtension;
import dev.relism.flash.ext.security.oidc.OidcProvider;
import dev.relism.flash.ext.webbundler.OperationMode;
import dev.relism.flash.ext.webbundler.PackageManager;
import dev.relism.flash.ext.webbundler.RuntimeMode;
import dev.relism.flash.ext.webbundler.WebBundlerConfig;
import dev.relism.flash.ext.webbundler.WebBundlerExtension;
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
        FlashApp app = FlashApp.create(Env.PORT).install(new WebBundlerExtension(webBundler(null)));
        // Discovery runs at boot, so OIDC is only installed against an issuer that exists.
        if (Env.OIDC_ISSUER != null) {
            app.install(new OidcExtension(OidcProvider.of("sso", Env.OIDC_ISSUER, Env.OIDC_CLIENT_ID, Env.OIDC_CLIENT_SECRET)
                    .name("Single sign-on").scopes(Env.OIDC_SCOPES)));
        }
        app.apply(new GlossaApp(Database.bootstrap()).origin(Env.ORIGIN)).startAndBlock();
    }

    /**
     * DEV ({@code -Dflash.env=dev} / {@code FLASH_ENV=dev}) orchestrates the Vite dev server
     * against {@code web/} on the filesystem. Everything else — the Docker image included, which
     * never sets {@code FLASH_ENV} — serves the frontend from the classpath, where the Docker
     * build has already embedded {@code web/dist} plus the manifest {@code WebBundlerBuild}
     * generates (see the {@code docker} Maven profile in pom.xml and the Dockerfile). Classpath
     * assets are explicitly unsupported in DEV, so this cannot be one config with a runtime-only
     * switch — the two need different {@code assetsSource} wiring.
     *
     * @param devPort the Vite port in DEV, {@code null} for Vite's default — a build composing this
     *                app beside another one on the same machine offsets it
     */
    public static WebBundlerConfig webBundler(Integer devPort) {
        if (Flash.DEV) {
            WebBundlerConfig.Builder dev = WebBundlerConfig.builder()
                    .webRoot(Path.of("web"))
                    .basePath("/")
                    .operationMode(OperationMode.MANAGED)
                    .assetsFromFilesystem(Path.of("dist"))
                    .packageManager(PackageManager.PNPM);
            return (devPort == null ? dev : dev.devPort(devPort)).build();
        }
        return WebBundlerConfig.builder()
                .basePath("/")
                .runtimeMode(RuntimeMode.PROD)
                .operationMode(OperationMode.MANAGED)
                .assetsFromClasspath("web/dist")
                .build();
    }
}
