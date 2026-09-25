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

    /** The reference is Scalar, in the application's own palette. */
    @Test
    void theApiReferenceIsServed() {
        app.get("/openapi/docs")
                .expectStatus(200)
                .expectBodyContains("Scalar.createApiReference")
                .expectBodyContains("/openapi.json")
                .expectBodyContains("--scalar-color-accent: oklch(0.62 0.176 148)");
    }

    /** What a route takes and answers is read off the handlers, so the spec is never behind them. */
    @Test
    void theSpecDescribesBodiesAndFailures() {
        app.get("/openapi.json")
                .expectStatus(200)
                .expectBodyContains("requestBody")
                .expectBodyContains("#/components/schemas/Error")
                .expectBodyContains("#/components/responses/Unauthorized")
                // The schema names, descriptions and rules come from the types themselves: the
                // validation engine says what its annotations mean, and the document carries it.
                .expectBodyContains("#/components/schemas/NewResource")
                .expectBodyContains("Dots group keys without a namespace of their own")
                .expectBodyContains("Only the keys under this dotted prefix.")
                .expectBodyContains("\"pattern\":")
                .expectBodyContains("\"maxLength\":")
                .expectBodyContains("\"required\":[");
    }
}
