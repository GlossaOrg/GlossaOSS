package dev.relism.glossa;

import dev.relism.flash.ext.cache.caffeine.CaffeineCacheExtension;
import dev.relism.flash.ext.jackson.JacksonExtension;
import dev.relism.flash.ext.limiter.LimiterExtension;
import dev.relism.flash.ext.mcp.McpConfig;
import dev.relism.flash.ext.mcp.McpExtension;
import dev.relism.flash.ext.openapi.OpenApiExtension;
import dev.relism.flash.ext.scheduler.SchedulerExtension;
import dev.relism.flash.ext.validation.ValidationExtension;
import dev.relism.flash.extension.FlashApp;
import dev.relism.flash.extension.FlashApplication;
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

    public GlossaApp(Database.Bootstrap db) {
        this.db = db;
    }

    @Override
    public void configure(FlashApp app) {
        JacksonExtension jackson = new JacksonExtension();

        app.install(db.extension())
                .install(jackson)
                .install(new ValidationExtension())
                // §10: delivery responses must be cheaply re-fetchable; §6: glossary and
                // translation-memory lookups are read-mostly and shared across requests.
                .install(new CaffeineCacheExtension())
                // §9: LibreTranslate suggestions run in the background, never on the request path.
                .install(new SchedulerExtension())
                // §10: the public delivery API must be rate-limited.
                .install(new LimiterExtension())
                .install(new OpenApiExtension("/openapi", "Glossa API", VERSION))
                // §12: MCP is a core capability, not an add-on. McpSecurity defaults to AUTO —
                // it locks /mcp down by itself once Main has installed OidcExtension, and stays
                // open when no issuer is configured, so this one line is correct either way.
                .install(new McpExtension(McpConfig.builder("glossa")
                        .version(VERSION)
                        .toolsPackage("dev.relism.glossa.mcp")
                        .build()))
                .use(jackson.autoJson())
                .scan("dev.relism.glossa.api");
    }
}
