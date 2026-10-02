package dev.relism.glossa.auth;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.security.Session;
import dev.relism.flash.ext.security.oidc.OidcPrincipal;
import dev.relism.glossa.support.Postgres;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** A session written by one store is read back by another over the same database, as after a restart. */
class SessionsTest {

    private static final Data data = Postgres.fresh("sessions").data();

    @Test
    void sessionsOutliveTheStoreThatWroteThem() {
        Instant expiry = Instant.now().plusSeconds(600);
        Users.LocalUser local = new Users.LocalUser("ada", 7);
        OidcPrincipal oidc = new OidcPrincipal("sso", "sub-1", Map.of("iss", "https://idp.test", "email", "ada@example.test"), "access", "refresh", "https://idp.test/logout");
        new Sessions(data).save(new Session("cookie-local", local, expiry));
        new Sessions(data).save(new Session("cookie-oidc", oidc, expiry));

        Sessions restarted = new Sessions(data);
        assertEquals(local, restarted.find("cookie-local").principal());
        assertEquals(oidc, restarted.find("cookie-oidc").principal());

        // A refresh rewrites the same session in place.
        Instant later = expiry.plusSeconds(600);
        restarted.save(new Session("cookie-oidc", oidc, later));
        assertEquals(later.toEpochMilli(), restarted.find("cookie-oidc").expiresAt().toEpochMilli());

        restarted.delete("cookie-local");
        assertNull(new Sessions(data).find("cookie-local"));
        assertNull(restarted.find("never-issued"));
    }

    @Test
    void aSaveSweepsSessionsPastTheirGrace() throws Exception {
        Sessions store = new Sessions(data);
        store.save(new Session("cookie-stale", new Users.LocalUser("old", 8), Instant.now().minusSeconds(3 * 86400)));
        store.save(new Session("cookie-fresh", new Users.LocalUser("new", 9), Instant.now().plusSeconds(600)));
        try (Connection connection = Postgres.connection("sessions");
             ResultSet rows = connection.createStatement().executeQuery("select count(*) from app_session where principal like '%\"old\"%'")) {
            rows.next();
            assertEquals(0, rows.getLong(1));
        }
    }
}
