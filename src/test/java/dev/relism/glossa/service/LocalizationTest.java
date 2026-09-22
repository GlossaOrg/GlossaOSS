package dev.relism.glossa.service;

import dev.relism.flash.ext.security.test.TestSecurity;
import dev.relism.flash.testing.FlashRequest;
import dev.relism.flash.testing.FlashResponse;
import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.auth.Users;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** §5–§11 over real Postgres: revisions, review, fallbacks, API-key grants and immutable delivery. */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LocalizationTest {

    @RegisterExtension
    static final FlashTest app = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("localization"), true, true)).install(new TestSecurity()));

    static long project, otherProject, manager, translator, reviewer, outsider;

    @BeforeAll
    static void seed() throws Exception {
        app.get("/healthz").expectStatus(200);
        project = sql("insert into project (slug, name) values ('words', 'Words') returning id");
        otherProject = sql("insert into project (slug, name) values ('elsewhere', 'Elsewhere') returning id");
        manager = account("content-manager@example.test");
        translator = account("content-translator@example.test");
        reviewer = account("content-reviewer@example.test");
        outsider = account("content-outsider@example.test");
        member(project, manager, "MANAGER", null);
        member(project, translator, "TRANSLATOR", "it");
        member(project, reviewer, "REVIEWER", "it");
        member(otherProject, outsider, "MANAGER", null);
    }

    @Test
    @Order(1)
    void revisionsHumanReviewFallbackAndImmutableDeliveryWorkEndToEnd() {
        put(manager, "/api/projects/" + project + "/locales/en", "{\"source\":true}")
                .expectStatus(200).expectBodyContains("\"locale\":\"en\"");
        put(manager, "/api/projects/" + project + "/locales/it", "{\"source\":false,\"fallbackLocale\":\"en\"}")
                .expectStatus(200).expectBodyContains("\"cardinal\":{\"many\":");

        String resource = post(manager, "/api/projects/" + project + "/resources", """
                {"key":"cart.items","context":"Basket heading","fieldType":"message",
                 "payload":{"pattern":"{count, plural, =0{Empty} one{# item} other{# items}}"},
                 "contract":{"count":{"type":"NUMBER","values":[]}}}
                """).expectStatus(201).body();
        long resourceId = number(resource, "id");
        long source = number(resource, "sourceRevisionId");

        // There is no Italian yet: resolution and formatting use the complete English message.
        post(translator, path(resourceId) + "/render/it", "{\"values\":{\"count\":2}}")
                .expectBodyContains("\"text\":\"2 items\"").expectBodyContains("\"resolvedLocale\":\"en\"");

        String proposal = put(translator, path(resourceId) + "/variants/it", """
                {"expectedHeadRevisionId":0,"sourceRevisionId":%d,
                 "payload":{"pattern":"{count, plural, one{# elemento} many{# milioni di elementi} other{# elementi}}"}}
                """.formatted(source)).expectStatus(200).body();
        long revision = number(proposal, "pendingRevisionId");

        // The translator can neither approve their own work nor publish it.
        post(translator, path(resourceId) + "/variants/it/review", "{\"revisionId\":" + revision + ",\"approve\":true}").expectStatus(403);
        post(translator, "/api/projects/" + project + "/catalogs/it", "{}").expectStatus(403);
        post(reviewer, path(resourceId) + "/variants/it/review", "{\"revisionId\":" + revision + ",\"approve\":true}").expectStatus(200);

        String release = post(manager, "/api/projects/" + project + "/catalogs/it", "{}").expectStatus(201).body();
        String hash = text(release, "hash");
        app.request().with(as(translator)).get("/api/projects/" + project + "/catalogs/it/" + hash)
                .expectStatus(200).expectBodyContains("cart.items").expectBodyContains("it");
        app.request().with(as(translator)).header("If-None-Match", "\"" + hash + "\"")
                .get("/api/projects/" + project + "/catalogs/it/" + hash).expectStatus(304);
        // Publishing an unchanged catalog keeps the release it already has.
        post(manager, "/api/projects/" + project + "/catalogs/it", "{}").expectBodyContains("\"hash\":\"" + hash + "\"");

        // A source change makes the translation stale, and delivery falls back as a whole message.
        String changed = put(manager, path(resourceId) + "/variants/en", """
                {"expectedHeadRevisionId":%d,
                 "payload":{"pattern":"{count, plural, =0{Nothing here} one{# item here} other{# items here}}"},
                 "contract":{"count":{"type":"NUMBER","values":[]}}}
                """.formatted(source)).expectStatus(200).body();
        long newSource = number(changed, "sourceRevisionId");
        post(translator, path(resourceId) + "/render/it", "{\"values\":{\"count\":2}}")
                .expectBodyContains("\"text\":\"2 items here\"").expectBodyContains("\"resolvedLocale\":\"en\"");

        // A proposal may not be approved once its source revision is stale.
        String pending = put(translator, path(resourceId) + "/variants/it", """
                {"expectedHeadRevisionId":%d,"sourceRevisionId":%d,
                 "payload":{"pattern":"{count, plural, one{# voce} many{# milioni di voci} other{# voci}}"}}
                """.formatted(revision, newSource)).expectStatus(200).body();
        long pendingId = number(pending, "pendingRevisionId");
        String second = put(manager, path(resourceId) + "/variants/en", """
                {"expectedHeadRevisionId":%d,
                 "payload":{"pattern":"{count, plural, =0{Zero} one{# result} other{# results}}"},
                 "contract":{"count":{"type":"NUMBER","values":[]}}}
                """.formatted(newSource)).expectStatus(200).body();
        post(reviewer, path(resourceId) + "/variants/it/review", "{\"revisionId\":" + pendingId + ",\"approve\":true}").expectStatus(409);

        // §9: an API key's proposal stays pending even with REVIEWER, and no API key can approve it.
        post(reviewer, path(resourceId) + "/variants/it/review", "{\"revisionId\":" + pendingId + ",\"approve\":false}").expectStatus(200);
        String token = text(post(manager, "/api/projects/" + project + "/keys",
                "{\"name\":\"translation-service\",\"role\":\"REVIEWER\",\"locale\":\"it\"}").expectStatus(201).body(), "token");
        long latestSource = number(second, "sourceRevisionId");
        String machine = key(token).json("""
                {"expectedHeadRevisionId":%d,"sourceRevisionId":%d,
                 "payload":{"pattern":"{count, plural, one{# esito} many{# milioni di esiti} other{# esiti}}"}}
                """.formatted(pendingId, latestSource)).put(path(resourceId) + "/variants/it").expectStatus(200).body();
        long machineRevision = number(machine, "pendingRevisionId");
        key(token).json("{\"revisionId\":" + machineRevision + ",\"approve\":true}")
                .post(path(resourceId) + "/variants/it/review").expectStatus(403).expectBodyContains("human review");
        post(reviewer, path(resourceId) + "/variants/it/review", "{\"revisionId\":" + machineRevision + ",\"approve\":true}").expectStatus(200);

        // The same grant reads the project it was issued for.
        key(token).get("/api/projects/" + project + "/resources?locale=it").expectStatus(200).expectBodyContains("cart.items");

        // The expected head stops a stale overwrite, and another project's manager sees nothing here.
        put(manager, path(resourceId) + "/variants/en", """
                {"expectedHeadRevisionId":%d,"payload":{"pattern":"Still old"},"contract":{}}
                """.formatted(newSource)).expectStatus(409);
        app.request().with(as(outsider)).get("/api/projects/" + project + "/resources?locale=en").expectStatus(403);
        app.request().with(as(translator)).get("/api/projects/" + project + "/resources?locale=it").expectBodyContains("\"stale\":false");

        // §8: the history rejects a write even when the application is bypassed.
        assertThrows(SQLException.class, () -> execute("update content_revision set actor = 'tampered' where id = " + latestSource));
        assertThrows(SQLException.class, () -> execute("delete from catalog_release where hash = '" + hash + "'"));
    }

    @Test
    @Order(2)
    void localeFallbacksAreCanonicalAndAcyclic() {
        put(manager, "/api/projects/" + project + "/locales/pt", "{\"source\":false,\"fallbackLocale\":\"en\"}").expectStatus(200);
        put(manager, "/api/projects/" + project + "/locales/pt-BR", "{\"source\":false,\"fallbackLocale\":\"pt\"}").expectStatus(200);
        put(manager, "/api/projects/" + project + "/locales/pt", "{\"source\":false,\"fallbackLocale\":\"pt-BR\"}")
                .expectStatus(400).expectBodyContains("cycle");
        put(manager, "/api/projects/" + project + "/locales/x-private", "{\"source\":false}").expectStatus(400);
    }

    /** Leaving the contract out is how an author declares variables: by writing them, at any depth. */
    @Test
    @Order(3)
    void aSourceWriteWithoutAContractHasItReadOffTheMessage() {
        String nested = "{paymentStatus, select, paid{{daysUntil, plural, =0{Today} one{In # day} other{In # days}}} other{Unavailable}}";
        String created = post(manager, "/api/projects/" + project + "/resources", """
                {"key":"event.reminder","fieldType":"message","payload":{"pattern":"%s"}}
                """.formatted(nested)).expectStatus(201).body();
        long resource = number(created, "id");

        app.request().with(as(manager)).json("{\"payload\":{\"pattern\":\"" + nested + "\"}}")
                .post("/api/projects/" + project + "/messages/en/analyze")
                .expectStatus(200)
                .expectBodyContains("\"daysUntil\":{\"type\":\"NUMBER\"")
                .expectBodyContains("\"paymentStatus\":{\"type\":\"SELECT\"")
                // The tree an editor renders, nested arm included, and the pattern it composes back to.
                .expectBodyContains("\"node\":\"choice\"")
                .expectBodyContains("\"match\":\"=0\"")
                .expectBodyContains("\"node\":\"text\",\"value\":\"Today\"");

        // The same variable used two incompatible ways is a mistake, whatever the depth.
        app.request().with(as(manager)).json("{\"payload\":{\"pattern\":\"{v, plural, other{#}} {v, select, a{x} other{y}}\"}}")
                .post("/api/projects/" + project + "/messages/en/analyze")
                .expectStatus(400).expectBodyContains("used as");

        // A translation still may not invent variables: it keeps the source's.
        String detail = app.request().with(as(manager)).get(path(resource) + "?locale=it").expectStatus(200).body();
        long source = number(detail, "sourceRevisionId");
        put(translator, path(resource) + "/variants/it",
                "{\"expectedHeadRevisionId\":0,\"sourceRevisionId\":" + source
                        + ",\"payload\":{\"pattern\":\"{paymentStatus, select, paid{{daysUntil, plural, =0{Oggi} one{Tra # giorno} other{Tra # giorni}}} other{Non disponibile}}\"}}")
                .expectStatus(200);
    }

    /** A locale goes with everything written in it; the source stays, and what fell back to it no longer does. */
    @Test
    @Order(4)
    void removingALocaleTakesItsTranslationsAndLeavesTheSource() throws Exception {
        put(manager, "/api/projects/" + project + "/locales/fr", "{\"source\":false,\"fallbackLocale\":\"en\"}").expectStatus(200);
        put(manager, "/api/projects/" + project + "/locales/fr-CA", "{\"source\":false,\"fallbackLocale\":\"fr\"}").expectStatus(200);
        long resource = number(post(manager, "/api/projects/" + project + "/resources",
                "{\"key\":\"farewell\",\"fieldType\":\"message\",\"payload\":{\"pattern\":\"Bye {name}\"}}").expectStatus(201).body(), "id");
        long source = number(app.request().with(as(manager)).get(path(resource) + "?locale=fr").expectStatus(200).body(), "sourceRevisionId");
        put(manager, path(resource) + "/variants/fr", "{\"expectedHeadRevisionId\":0,\"sourceRevisionId\":" + source
                + ",\"payload\":{\"pattern\":\"Au revoir {name}\"}}").expectStatus(200);
        app.request().with(as(manager)).post("/api/projects/" + project + "/catalogs/fr").expectStatus(201);

        app.request().with(as(manager)).delete("/api/projects/" + project + "/locales/fr").expectStatus(204);

        String locales = app.request().with(as(manager)).get("/api/projects/" + project + "/locales").expectStatus(200).body();
        assertFalse(locales.contains("\"locale\":\"fr\""));
        assertTrue(locales.contains("\"locale\":\"fr-CA\",\"source\":false,\"fallbackLocale\":null"));
        assertEquals(0, sql("select count(*) from content_variant where project_id = " + project + " and locale = 'fr'"));
        assertEquals(0, sql("select count(*) from catalog_release where project_id = " + project + " and locale = 'fr'"));
        // The source revision it was translated from is untouched.
        app.request().with(as(manager)).get(path(resource) + "?locale=en").expectStatus(200).expectBodyContains("Bye {name}");

        // Outside a locale's removal the history is as immutable as before: no delete, no update.
        assertThrows(SQLException.class, () -> execute("delete from content_event where resource_id = " + resource));
        assertThrows(SQLException.class, () -> execute("update content_revision set actor = actor where id = " + source));

        app.request().with(as(manager)).delete("/api/projects/" + project + "/locales/en").expectStatus(409);
        app.request().with(as(translator)).delete("/api/projects/" + project + "/locales/it").expectStatus(403);
    }

    /** One list carries every resource's source and its value in the locale, whatever else was written where. */
    @Test
    @Order(5)
    void theListCarriesEachResourcesSourceAndItsValueInTheLocale() {
        String alpha = post(manager, "/api/projects/" + project + "/resources",
                "{\"key\":\"list.alpha\",\"fieldType\":\"message\",\"payload\":{\"pattern\":\"Alpha\"}}").expectStatus(201).body();
        post(manager, "/api/projects/" + project + "/resources",
                "{\"key\":\"list.beta\",\"fieldType\":\"message\",\"payload\":{\"pattern\":\"Beta\"}}").expectStatus(201);
        put(manager, path(number(alpha, "id")) + "/variants/it", "{\"expectedHeadRevisionId\":0,\"sourceRevisionId\":" + number(alpha, "sourceRevisionId")
                + ",\"payload\":{\"pattern\":\"Alfa\"}}").expectStatus(200);

        String list = app.request().with(as(manager)).get("/api/projects/" + project + "/resources?locale=it&prefix=list.").expectStatus(200).body();
        assertTrue(list.contains("\"sourcePayload\":{\"pattern\":\"Alpha\"},\"payload\":{\"pattern\":\"Alfa\"}"), list);
        assertTrue(list.contains("\"sourcePayload\":{\"pattern\":\"Beta\"},\"payload\":null"), list);
        assertFalse(list.contains("cart.items"), list);
        // The source is a locale like any other: its value is the source.
        app.request().with(as(manager)).get("/api/projects/" + project + "/resources?locale=en&prefix=list.alpha").expectStatus(200)
                .expectBodyContains("\"sourcePayload\":{\"pattern\":\"Alpha\"},\"payload\":{\"pattern\":\"Alpha\"}");
    }

    private static String path(long resource) {
        return "/api/projects/" + project + "/resources/" + resource;
    }

    private static FlashResponse post(long user, String path, String body) {
        return app.request().with(as(user)).json(body).post(path);
    }

    private static FlashResponse put(long user, String path, String body) {
        return app.request().with(as(user)).json(body).put(path);
    }

    private static FlashRequest key(String token) {
        return app.request().header("Authorization", "Bearer " + token);
    }

    private static Consumer<FlashRequest> as(long user) {
        return TestSecurity.as(new Users.LocalUser("content-" + user, user));
    }

    private static long number(String json, String field) {
        return Long.parseLong(json.replaceAll(".*\\\"" + field + "\\\":(\\d+).*", "$1"));
    }

    private static String text(String json, String field) {
        return json.replaceAll(".*\\\"" + field + "\\\":\\\"([^\\\"]+)\\\".*", "$1");
    }

    private static long account(String email) throws Exception {
        return sql("insert into app_user (email, name) values ('" + email + "', '" + email + "') returning id");
    }

    private static void member(long project, long user, String role, String locale) throws Exception {
        sql("insert into project_member (project_id, user_id, role, locale) values ("
                + project + ", " + user + ", '" + role + "', " + (locale == null ? "null" : "'" + locale + "'") + ") returning id");
    }

    private static long sql(String query) throws Exception {
        try (Connection connection = database(); ResultSet rows = connection.createStatement().executeQuery(query)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private static void execute(String query) throws SQLException {
        try (Connection connection = database()) {
            connection.createStatement().execute(query);
        }
    }

    private static Connection database() throws SQLException {
        return Postgres.connection("localization");
    }
}
