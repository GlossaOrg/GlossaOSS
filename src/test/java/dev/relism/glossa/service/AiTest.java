package dev.relism.glossa.service;

import com.sun.net.httpserver.HttpServer;
import dev.relism.flash.ext.security.test.TestSecurity;
import dev.relism.flash.testing.FlashRequest;
import dev.relism.flash.testing.FlashResponse;
import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.auth.Users;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** §9 against a stand-in OpenAI-compatible provider: who may configure it, and what a suggestion may be. */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AiTest {

    @RegisterExtension
    static final FlashTest app = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("ai"), true, true)).install(new TestSecurity()));

    /** What the stand-in answers next, in order; the last answer repeats once the queue runs dry. */
    private static final Deque<String> ANSWERS = new ArrayDeque<>();

    private static HttpServer provider;
    private static String providerUrl;
    private static long project, admin, translator;

    @BeforeAll
    static void seed() throws Exception {
        provider = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        provider.createContext("/v1/chat/completions", exchange -> {
            String answer = ANSWERS.size() > 1 ? ANSWERS.poll() : ANSWERS.peek();
            byte[] body = ("{\"choices\":[{\"message\":{\"content\":\"" + answer.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        provider.start();
        providerUrl = "http://127.0.0.1:" + provider.getAddress().getPort() + "/v1";

        app.get("/healthz").expectStatus(200);
        project = sql("insert into project (slug, name) values ('ai', 'Ai') returning id");
        admin = sql("insert into app_user (email, name, admin) values ('ai-admin@example.test', 'Admin', true) returning id");
        translator = sql("insert into app_user (email, name) values ('ai-translator@example.test', 'Translator') returning id");
        sql("insert into project_member (project_id, user_id, role, locale) values (" + project + ", " + translator + ", 'TRANSLATOR', 'it') returning id");
        put(admin, "/api/projects/" + project + "/locales/en", "{\"source\":true}").expectStatus(200);
        put(admin, "/api/projects/" + project + "/locales/it", "{\"source\":false}").expectStatus(200);
    }

    @AfterAll
    static void stop() {
        provider.stop(0);
    }

    @Test
    @Order(1)
    void theProviderIsAnAdministratorsToSetAndItsKeyNeverComesBack() throws Exception {
        // Off until it is turned on, whoever asks.
        translate("{\"payload\":{\"pattern\":\"Hello\"}}").expectStatus(403).expectBodyContains("off");
        app.request().with(as(translator)).get("/api/ai").expectStatus(403);
        app.request().with(as(translator)).json("{\"enabled\":true}").put("/api/ai").expectStatus(403);

        // Enabling it without a provider is refused rather than half-saved.
        put(admin, "/api/ai", "{\"enabled\":true}").expectStatus(400).expectBodyContains("Fill in");

        put(admin, "/api/ai", "{\"enabled\":true,\"baseUrl\":\"" + providerUrl + "\",\"model\":\"stand-in\",\"apiKey\":\"sk-secret\"}")
                .expectStatus(200).expectBodyContains("\"configured\":true");
        app.request().with(as(admin)).get("/api/ai").expectStatus(200)
                .expectBodyContains("\"model\":\"stand-in\"").expectBodyContains("\"configured\":true");
        assertFalse(app.request().with(as(admin)).get("/api/ai").body().contains("sk-secret"));

        // Sealed at rest: the column holds neither the key nor anything resembling it.
        String stored = text("select api_key from ai_settings");
        assertFalse(stored.contains("sk-secret"), stored);
        assertTrue(stored.length() > 16, stored);
    }

    @Test
    @Order(2)
    void aSuggestionIsCheckedAgainstTheSourcesContractAndNeverStored() throws Exception {
        ANSWERS.clear();
        ANSWERS.add("{count, plural, one{# articolo} other{# articoli}}");
        translate("{\"payload\":{\"pattern\":\"{count, plural, one{# item} other{# items}}\"},\"context\":\"Basket heading\"}")
                .expectStatus(200)
                .expectBodyContains("articoli")
                .expectBodyContains("\"model\":\"stand-in\"");

        // Nothing was written: no revision, no variant, no event.
        assertEquals(0, sql("select count(*) from content_revision"));

        // The source locale is not a translation target.
        app.request().with(as(admin)).json("{\"payload\":{\"pattern\":\"Hello\"}}")
                .post("/api/projects/" + project + "/messages/en/translate").expectStatus(400).expectBodyContains("source locale");
    }

    /** The parser is the guardrail: a broken answer is retried once with its own complaint, then refused. */
    @Test
    @Order(3)
    void anAnswerThatIsNotAValidMessageIsRetriedThenRefused() {
        ANSWERS.clear();
        // Unbalanced, so the parser refuses it; the second answer says something else, to tell them apart.
        ANSWERS.add("{count, plural, one{# articolo} other{# articoli}");
        ANSWERS.add("{count, plural, one{# mela} other{# mele}}");
        String suggested = translate("{\"payload\":{\"pattern\":\"{count, plural, one{# item} other{# items}}\"}}")
                .expectStatus(200).body();
        assertTrue(suggested.contains("mele"), suggested);
        assertFalse(suggested.contains("articoli"), suggested);

        // A translation may not drop the source's variables, twice in a row is a refusal.
        ANSWERS.clear();
        ANSWERS.add("Articoli nel carrello");
        translate("{\"payload\":{\"pattern\":\"{count, plural, one{# item} other{# items}}\"}}")
                .expectStatus(502).expectBodyContains("usable message");
    }

    private static FlashResponse translate(String body) {
        return app.request().with(as(translator)).json(body).post("/api/projects/" + project + "/messages/it/translate");
    }

    private static FlashResponse put(long user, String path, String body) {
        return app.request().with(as(user)).json(body).put(path);
    }

    private static Consumer<FlashRequest> as(long user) {
        return TestSecurity.as(new Users.LocalUser("ai-" + user, user));
    }

    private static long sql(String query) throws Exception {
        try (Connection connection = Postgres.connection("ai"); ResultSet rows = connection.createStatement().executeQuery(query)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private static String text(String query) throws Exception {
        try (Connection connection = Postgres.connection("ai"); ResultSet rows = connection.createStatement().executeQuery(query)) {
            rows.next();
            return rows.getString(1);
        }
    }
}
