package dev.relism.glossa.auth;

import dev.relism.flash.ext.security.form.PasswordEncoder;
import dev.relism.flash.ext.security.oidc.OidcPrincipal;
import dev.relism.flash.ext.security.test.TestSecurity;
import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.sql.Connection;
import java.sql.ResultSet;
import java.util.Map;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * What Glossa itself decides in §8 and §11: accounts, per-project roles, key grants and provisioning.
 * The authentication mechanics these sit on are Flash's, and tested there.
 */
class AuthTest {

    @RegisterExtension
    static final FlashTest app = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.bootstrap(), true, true)).install(new TestSecurity()));

    static long project, otherProject, manager, translator;

    @BeforeAll
    static void seed() throws Exception {
        app.get("/healthz").expectStatus(200);
        project = sql("insert into project (slug, name) values ('alpha', 'Alpha') returning id");
        otherProject = sql("insert into project (slug, name) values ('beta', 'Beta') returning id");
        manager = account("manager@example.test");
        translator = account("translator@example.test");
        sql("insert into project_member (project_id, user_id, role) values (" + project + ", " + manager + ", 'MANAGER') returning id");
        sql("insert into project_member (project_id, user_id, role) values (" + project + ", " + translator + ", 'TRANSLATOR') returning id");
    }

    static Consumer<dev.relism.flash.testing.FlashRequest> as(long user) {
        return TestSecurity.as(new Users.LocalUser("user-" + user, user));
    }

    @Test
    void aGlossaAccountSignsInWithItsPassword() {
        String cookie = app.request().header("content-type", "application/x-www-form-urlencoded")
                .body("username=manager%40example.test&password=s3cret").post("/auth/form/login")
                .expectStatus(303).header("Set-Cookie");
        app.request().header("Cookie", cookie.substring(0, cookie.indexOf(';'))).get("/api/me").expectBodyContains("manager@example.test");
    }

    @Test
    void rolesAreHeldPerProject() {
        app.request().with(as(manager)).get("/api/projects/" + project + "/keys").expectStatus(200);
        app.request().with(as(translator)).get("/api/projects/" + project + "/keys").expectStatus(403);
        app.request().with(as(manager)).get("/api/projects/" + otherProject + "/keys").expectStatus(403);
    }

    /** §11: a key is its own grant — a service holding one has exactly what it was issued with, nowhere else. */
    @Test
    void anApiKeyActsWithinItsGrantOnly() {
        String reader = issue("READER");
        app.request().header("Authorization", "Bearer " + reader).get("/api/me").expectBodyContains("manager@example.test");
        app.request().header("Authorization", "Bearer " + reader).get("/api/projects/" + project + "/keys").expectStatus(403);

        String admin = issue("MANAGER");
        app.request().header("Authorization", "Bearer " + admin).get("/api/projects/" + project + "/keys").expectStatus(200);
        app.request().header("Authorization", "Bearer " + admin).get("/api/projects/" + otherProject + "/keys").expectStatus(403);
    }

    @Test
    void aRevokedKeyIsRefused() {
        String body = app.request().with(as(manager)).json("{\"name\":\"ci\",\"role\":\"READER\"}")
                .post("/api/projects/" + project + "/keys").expectStatus(201).body();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");
        String token = body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
        app.request().with(as(manager)).delete("/api/projects/" + project + "/keys/" + id).expectStatus(204);
        app.request().header("Authorization", "Bearer " + token).get("/api/me").expectStatus(401);
    }

    @Test
    void rotationRevokesTheOldTokenAndKeepsTheGrant() {
        String body = app.request().with(as(manager)).json("{\"name\":\"ci\",\"role\":\"MANAGER\"}")
                .post("/api/projects/" + project + "/keys").expectStatus(201).body();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");
        String rotated = app.request().with(as(manager)).post("/api/projects/" + project + "/keys/" + id + "/rotate")
                .expectStatus(200).expectBodyContains("\"role\":\"MANAGER\"").body().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
        app.request().header("Authorization", "Bearer " + body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1")).get("/api/me").expectStatus(401);
        app.request().header("Authorization", "Bearer " + rotated).get("/api/projects/" + project + "/keys").expectStatus(200);
        app.request().with(as(manager)).post("/api/projects/" + project + "/keys/" + id + "/rotate").expectStatus(409);
    }

    @Test
    void projectsAreListedWithTheCallersRole() {
        app.request().with(as(translator)).get("/api/projects")
                .expectStatus(200).expectBody("[{\"id\":" + project + ",\"slug\":\"alpha\",\"name\":\"Alpha\",\"role\":\"TRANSLATOR\"}]");
    }

    /** §11: an identity provider vouching for someone is not an account — an administrator's invitation is. */
    @Test
    void anInvitedOidcCallerIsProvisionedOnceByIssuerAndSubject() throws Exception {
        sql("insert into invitation (email, sso, created_by) values ('seven@example.test', true, " + manager + ") returning id");
        OidcPrincipal oidc = oidc("sub-7", "seven@example.test");
        app.request().with(TestSecurity.as(oidc)).get("/api/me").expectBodyContains("seven@example.test");
        app.request().with(TestSecurity.as(oidc)).get("/api/me").expectStatus(200);
        assertEquals(1, sql("select count(*) from user_identity where issuer = 'https://id.example.test' and subject = 'sub-7'"));
    }

    @Test
    void anUninvitedOidcCallerIsRefused() {
        app.request().with(TestSecurity.as(oidc("sub-8", "eight@example.test"))).get("/api/me")
                .expectStatus(403).expectBodyContains("been invited");
    }

    private static OidcPrincipal oidc(String subject, String email) {
        return new OidcPrincipal("sso", subject, Map.of("iss", "https://id.example.test", "email", email, "email_verified", true), "at", null, null);
    }

    private static String issue(String role) {
        return app.request().with(as(manager)).json("{\"name\":\"k\",\"role\":\"" + role + "\"}")
                .post("/api/projects/" + project + "/keys").expectStatus(201).body().replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    private static long account(String email) throws Exception {
        long id = sql("insert into app_user (email, name) values ('" + email + "', '" + email + "') returning id");
        sql("insert into user_identity (user_id, issuer, subject) values (" + id + ", 'local', '" + email + "') returning id");
        sql("insert into local_credential (user_id, password_hash) values (" + id + ", '" + PasswordEncoder.pbkdf2().encode("s3cret") + "') returning user_id");
        return id;
    }

    private static long sql(String query) throws Exception {
        try (Connection connection = Postgres.connection(); ResultSet rows = connection.createStatement().executeQuery(query)) {
            rows.next();
            return rows.getLong(1);
        }
    }
}
