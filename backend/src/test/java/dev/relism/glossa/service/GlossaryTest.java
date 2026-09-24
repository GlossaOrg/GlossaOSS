package dev.relism.glossa.service;

import dev.relism.flash.ext.security.test.TestSecurity;
import dev.relism.flash.testing.FlashRequest;
import dev.relism.flash.testing.FlashResponse;
import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.auth.Users;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.sql.Connection;
import java.sql.ResultSet;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** §6's glossary: a manager writes it, whoever works in the locale reads it, and it goes with its locale. */
class GlossaryTest {

    @RegisterExtension
    static final FlashTest app = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("glossary"), true, true)).install(new TestSecurity()));

    static long project, manager, translator;

    @BeforeAll
    static void seed() throws Exception {
        app.get("/healthz").expectStatus(200);
        project = sql("insert into project (slug, name) values ('terms', 'Terms') returning id");
        manager = sql("insert into app_user (email, name) values ('glossary-manager@example.test', 'Manager') returning id");
        translator = sql("insert into app_user (email, name) values ('glossary-translator@example.test', 'Translator') returning id");
        sql("insert into project_member (project_id, user_id, role, locale) values (" + project + ", " + manager + ", 'MANAGER', null) returning id");
        sql("insert into project_member (project_id, user_id, role, locale) values (" + project + ", " + translator + ", 'TRANSLATOR', 'it') returning id");
        put(manager, "/api/projects/" + project + "/locales/en", "{\"source\":true}").expectStatus(200);
        put(manager, "/api/projects/" + project + "/locales/it", "{\"source\":false}").expectStatus(200);
        put(manager, "/api/projects/" + project + "/locales/fr", "{\"source\":false}").expectStatus(200);
    }

    @Test
    void aTermIsEitherLeftAloneEverywhereOrTranslatedInOneLocale() {
        // No locale and no translation: leave it exactly as it is, in every language.
        put(manager, glossary(), "{\"term\":\"Glossa\"}").expectStatus(200)
                .expectBodyContains("\"locale\":null").expectBodyContains("\"translation\":null");
        put(manager, glossary(), "{\"term\":\"cart\",\"locale\":\"it\",\"translation\":\"carrello\"}").expectStatus(200)
                .expectBodyContains("\"translation\":\"carrello\"");
        put(manager, glossary(), "{\"term\":\"cart\",\"locale\":\"fr\",\"translation\":\"panier\"}").expectStatus(200);

        // Saving the same term for the same locale replaces it rather than adding a second row.
        put(manager, glossary(), "{\"term\":\"CART\",\"locale\":\"it\",\"translation\":\"carrello della spesa\"}").expectStatus(200);
        String italian = app.request().with(as(translator)).get(glossary() + "?locale=it").expectStatus(200).body();
        assertTrue(italian.contains("carrello della spesa"), italian);
        assertFalse(italian.contains("\"carrello\","), italian);
        // One locale never sees another's terms, but everybody sees the ones that apply to all.
        assertFalse(italian.contains("panier"), italian);
        assertTrue(italian.contains("Glossa"), italian);

        // A locale the project has not enabled would be a term nobody could ever use.
        put(manager, glossary(), "{\"term\":\"cart\",\"locale\":\"de\",\"translation\":\"Warenkorb\"}")
                .expectStatus(400).expectBodyContains("isn't enabled");
        // A blank term breaks the constraint its own type declares, before the service sees it.
        put(manager, glossary(), "{\"term\":\"  \"}").expectStatus(422).expectBodyContains("term is required");

        // A translator reads it and cannot write it.
        app.request().with(as(translator)).json("{\"term\":\"checkout\",\"locale\":\"it\",\"translation\":\"pagamento\"}")
                .put(glossary()).expectStatus(403);
    }

    /** A term for a removed locale would outlive the locale it describes. */
    @Test
    void removingALocaleTakesItsTermsAndLeavesTheRest() throws Exception {
        put(manager, "/api/projects/" + project + "/locales/pt", "{\"source\":false}").expectStatus(200);
        put(manager, glossary(), "{\"term\":\"basket\",\"locale\":\"pt\",\"translation\":\"cesto\"}").expectStatus(200);
        put(manager, glossary(), "{\"term\":\"basket\",\"translation\":null}").expectStatus(200);

        app.request().with(as(manager)).delete("/api/projects/" + project + "/locales/pt").expectStatus(204);

        String all = app.request().with(as(manager)).get(glossary()).expectStatus(200).body();
        assertFalse(all.contains("cesto"), all);
        assertTrue(all.contains("basket"), all);
        assertTrue(sql("select count(*) from glossary_term where locale = 'pt'") == 0);
    }

    @Test
    void aTermIsRemovedByIdAndOnlyWithinItsProject() {
        String saved = put(manager, glossary(), "{\"term\":\"invoice\",\"locale\":\"it\",\"translation\":\"fattura\"}").expectStatus(200).body();
        long id = Long.parseLong(saved.replaceAll("\\{\"id\":(\\d+).*", "$1"));
        app.request().with(as(manager)).delete("/api/projects/" + project + "/glossary/" + id).expectStatus(204);
        app.request().with(as(manager)).delete("/api/projects/" + project + "/glossary/" + id).expectStatus(404);
    }

    private static String glossary() {
        return "/api/projects/" + project + "/glossary";
    }

    private static FlashResponse put(long user, String path, String body) {
        return app.request().with(as(user)).json(body).put(path);
    }

    private static Consumer<FlashRequest> as(long user) {
        return TestSecurity.as(new Users.LocalUser("glossary-" + user, user));
    }

    private static long sql(String query) throws Exception {
        try (Connection connection = Postgres.connection("glossary"); ResultSet rows = connection.createStatement().executeQuery(query)) {
            rows.next();
            return rows.getLong(1);
        }
    }
}
