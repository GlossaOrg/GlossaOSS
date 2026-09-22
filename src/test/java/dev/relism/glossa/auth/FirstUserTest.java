package dev.relism.glossa.auth;

import dev.relism.flash.ext.security.oidc.OidcPrincipal;
import dev.relism.flash.ext.security.test.TestSecurity;
import dev.relism.flash.testing.FlashTest;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.util.Map;

/** §11: on a fresh install the first user, however they arrive, administers it — and nobody after them does. */
class FirstUserTest {

    @RegisterExtension
    static final FlashTest local = FlashTest.of(new GlossaApp(Postgres.fresh("first_local"), true, true));

    @RegisterExtension
    static final FlashTest invites = FlashTest.of(new GlossaApp(Postgres.fresh("invites"), true, true));

    @RegisterExtension
    static final FlashTest resets = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("resets"), true, true)).install(new TestSecurity()));

    @RegisterExtension
    static final FlashTest sso = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("first_sso"), false, true)).install(new TestSecurity()));

    /** An installation that does not administer its own accounts: no administrator to invite, so nobody needs an invitation. */
    @RegisterExtension
    static final FlashTest provisioned = FlashTest.of(flash -> flash.apply(new GlossaApp(Postgres.fresh("provisioned"), false, false)).install(new TestSecurity()));

    @Test
    void theFirstAccountIsCreatedOnceAndAdministers() {
        local.get("/api/setup").expectBody("{\"firstUser\":true}");
        local.request().json("{\"email\":\"dev\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(400);
        local.request().json("{\"email\":\"first@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(201);
        local.request().json("{\"email\":\"second@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(409);
        local.get("/api/setup").expectBody("{\"firstUser\":false}");
        String cookie = local.request().header("content-type", "application/x-www-form-urlencoded")
                .body("username=first%40example.test&password=Long-enough%21").post("/auth/form/login").expectStatus(303).header("Set-Cookie");
        local.request().header("Cookie", cookie.substring(0, cookie.indexOf(';'))).get("/api/me").expectBodyContains("\"admin\":true");
    }

    @Test
    void theFirstSingleSignOnUserAdministersAndTheNextIsOnlyLetInOnceInvited() {
        sso.request().with(TestSecurity.as(oidc("sub-1"))).get("/api/me").expectBodyContains("\"admin\":true");
        sso.request().with(TestSecurity.as(oidc("sub-2"))).get("/api/me").expectStatus(403).expectBodyContains("been invited");
        sso.request().with(TestSecurity.as(oidc("sub-1"))).json("{\"email\":\"sub-2@example.test\",\"sso\":true,\"expiresInDays\":7}")
                .post("/api/users/invites").expectStatus(201);
        sso.request().with(TestSecurity.as(oidc("sub-2"))).get("/api/me").expectBodyContains("\"admin\":false");
        // Accounts belong to the installation: only its administrator lists them, whatever roles anyone holds on a project.
        sso.request().with(TestSecurity.as(oidc("sub-1"))).get("/api/users").expectStatus(200).expectBodyContains("sub-2@example.test");
        sso.request().with(TestSecurity.as(oidc("sub-2"))).get("/api/users").expectStatus(403);
        sso.request().json("{\"email\":\"late@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(404);
    }

    /** Where accounts are not the installation's, the provider's word makes one — and it administers nothing. */
    @Test
    void anInstallationNotOwningItsAccountsLetsEveryProviderAccountInAndMakesNoAdministrator() {
        provisioned.request().with(TestSecurity.as(oidc("sub-1"))).get("/api/me").expectBodyContains("\"admin\":false");
        provisioned.request().with(TestSecurity.as(oidc("sub-2"))).get("/api/me").expectBodyContains("\"admin\":false");
        // Nobody administers the installation, so its account list is nobody's to read and there is no first-account screen.
        provisioned.request().with(TestSecurity.as(oidc("sub-1"))).get("/api/users").expectStatus(403);
        provisioned.get("/api/setup").expectBody("{\"firstUser\":false}");
        provisioned.request().json("{\"email\":\"late@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(404);
        // The one refusal that survives: the gate still stops an account that was taken away.
        provisioned.request().with(TestSecurity.as(oidc("sub-3"))).get("/api/projects").expectStatus(200).expectBody("[]");
    }

    /**
     * §11: an account is a person, not a credential. A second provider vouching for an address that
     * already has an account joins that account — but only on its word that the address is verified,
     * which is the whole defence against claiming somebody else's by typing their email.
     */
    @Test
    void averifiedSecondProviderJoinsTheAccountTheEmailAlreadyHas() {
        String first = provisioned.request().with(TestSecurity.as(oidc("sub-9"))).get("/api/me").expectStatus(200).body();

        String joined = provisioned.request().with(TestSecurity.as(oidc("elsewhere-9", "sub-9@example.test", "https://other.example.test", true)))
                .get("/api/me").expectStatus(200).body();
        assertEquals(idOf(first), idOf(joined), "a verified second provider must reach the same account");

        // Unverified: no join, and no second account for an address that is already somebody's.
        provisioned.request().with(TestSecurity.as(oidc("liar-9", "sub-9@example.test", "https://third.example.test", false)))
                .get("/api/me").expectStatus(403).expectBodyContains("already exists");

        // Both ways in still reach it, and the account is still one row.
        provisioned.request().with(TestSecurity.as(oidc("sub-9"))).get("/api/me").expectBodyContains("\"id\":" + idOf(first) + ",");
    }

    /** §11's whole password path: an administrator invites, the link is taken up once, and a suspended account stops signing in. */
    @Test
    void anInvitationBecomesAnAccountThatCanBeSuspended() {
        invites.request().json("{\"email\":\"boss@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(201);
        String boss = signIn("boss@example.test", "Long-enough!");
        String link = invites.request().header("Cookie", boss).json("{\"email\":\"newbie@example.test\",\"name\":\"New Bie\",\"expiresInDays\":7}")
                .post("/api/users/invites").expectStatus(201).body().replaceAll(".*\"link\":\"([^\"]+)\".*", "$1");
        String token = link.substring(link.lastIndexOf('/') + 1);

        invites.get("/api/invite/" + token).expectStatus(200).expectBodyContains("newbie@example.test");
        invites.request().json("{\"password\":\"Another-long!\"}").post("/api/invite/" + token).expectStatus(201);
        invites.get("/api/invite/" + token).expectStatus(404);   // one link, one account

        String newbie = signIn("newbie@example.test", "Another-long!");
        invites.request().header("Cookie", newbie).get("/api/me").expectBodyContains("newbie@example.test");
        String id = invites.request().header("Cookie", boss).get("/api/users").expectStatus(200).body()
                .replaceAll(".*\\{\"id\":(\\d+),\"invitation\":false,\"name\":\"New Bie\".*", "$1");
        invites.request().header("Cookie", boss).post("/api/users/" + id + "/disable").expectStatus(204);
        invites.request().header("Cookie", newbie).get("/api/me").expectStatus(403).expectBodyContains("disabled");
    }

    /** A reset retires the password rather than changing it, and an email belongs to one account whatever signs it in. */
    @Test
    void aResetRetiresThePasswordAndAnEmailBelongsToOneAccount() {
        resets.request().json("{\"email\":\"chief@example.test\",\"password\":\"Long-enough!\"}").post("/api/setup").expectStatus(201);
        String chief = signIn(resets, "chief@example.test", "Long-enough!");
        String id = resets.request().header("Cookie", chief).get("/api/users").expectStatus(200).body()
                .replaceAll(".*\\{\"id\":(\\d+),\"invitation\":false.*", "$1");

        resets.request().header("Cookie", chief).post("/api/users/" + id + "/password-reset?days=7").expectStatus(201);
        // The session stands, and says the account has a password to choose.
        resets.request().header("Cookie", chief).get("/api/me").expectBodyContains("\"mustChangePassword\":true");
        // A reset is not an invitation: the table still shows one row for this account.
        resets.request().header("Cookie", chief).get("/api/users").expectStatus(200).expectBodyContains("\"invitation\":false");

        resets.request().header("Cookie", chief).json("{\"password\":\"weak\"}").post("/api/me/password").expectStatus(400);
        resets.request().header("Cookie", chief).json("{\"password\":\"Long-enough!\"}").post("/api/me/password").expectStatus(400).expectBodyContains("used before");
        resets.request().header("Cookie", chief).json("{\"password\":\"Brand-new-one!\"}").post("/api/me/password").expectStatus(204);
        resets.request().header("Cookie", chief).get("/api/me").expectBodyContains("\"mustChangePassword\":false");
        signIn(resets, "chief@example.test", "Brand-new-one%21");

        // Same email, other strategy: invited or not, it is already somebody's.
        resets.request().header("Cookie", chief).json("{\"email\":\"chief@example.test\",\"sso\":true,\"expiresInDays\":7}")
                .post("/api/users/invites").expectStatus(409);
    }

    private static String signIn(String email, String password) {
        return signIn(invites, email, password);
    }

    private static String signIn(FlashTest app, String email, String password) {
        String cookie = app.request().header("content-type", "application/x-www-form-urlencoded")
                .body("username=" + email.replace("@", "%40") + "&password=" + password.replace(" ", "+"))
                .post("/auth/form/login").expectStatus(303).header("Set-Cookie");
        return cookie.substring(0, cookie.indexOf(';'));
    }

    private static OidcPrincipal oidc(String subject) {
        return oidc(subject, subject + "@example.test", "https://id.example.test", true);
    }

    private static OidcPrincipal oidc(String subject, String email, String issuer, boolean verified) {
        return new OidcPrincipal("sso", subject, Map.of("iss", issuer, "email", email, "email_verified", verified), "at", null, null);
    }

    private static String idOf(String me) {
        return me.replaceAll("\\{\"id\":(\\d+).*", "$1");
    }
}
