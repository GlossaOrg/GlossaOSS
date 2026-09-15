package dev.relism.glossa;

import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

/**
 * The harness check: {@link GlossaApp}'s full extension graph boots against a real Postgres and
 * answers a real request. It is what fails first if a dependency, a migration or an extension
 * install order breaks — keep it passing as the domain lands on top.
 */
class GlossaBootTest {

    @RegisterExtension
    static final FlashTest app = FlashTest.of(new GlossaApp(Postgres.bootstrap(), true, true));

    /** Also covers the scanned-handler path and Jackson's automatic JSON marshalling. */
    @Test
    void healthzAnswers() {
        app.get("/healthz")
                .expectStatus(200)
                .expectBodyContains("glossa")
                .expectBodyContains("ok");
    }

    /** Authentication is never absent: password sign-in guards the route when no identity provider is configured. */
    @Test
    void meIsRefusedWithoutASession() {
        app.request().header("Accept", "application/json").get("/api/me").expectStatus(401);
    }

    @Test
    void openApiSpecIsGenerated() {
        app.get("/openapi.json")
                .expectStatus(200)
                .expectBodyContains("Glossa API");
    }
}
