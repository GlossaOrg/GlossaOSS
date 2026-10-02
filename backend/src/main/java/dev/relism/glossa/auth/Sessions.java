package dev.relism.glossa.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.security.Principal;
import dev.relism.flash.ext.security.Session;
import dev.relism.flash.ext.security.SessionStore;
import dev.relism.flash.ext.security.oidc.OidcPrincipal;
import dev.relism.glossa.persistence.entities.AppSession;
import lombok.RequiredArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

/** Sessions in Postgres (§2), so a restart signs nobody out. Only the principals Glossa issues are read back. */
@RequiredArgsConstructor
public final class Sessions implements SessionStore {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, Class<? extends Principal>> KINDS = Map.of(
            "local", Users.LocalUser.class,
            "oidc", OidcPrincipal.class);
    /** How long past its expiry a session stays refreshable; after it, the next save deletes the row. */
    private static final Duration GRACE = Duration.ofDays(1);

    private final Data data;

    @Override
    public void save(Session session) {
        String kind = KINDS.entrySet().stream().filter(k -> k.getValue().isInstance(session.principal())).map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> new IllegalStateException("No stored form for " + session.principal().getClass().getName()));
        String id = hash(session.id());
        String principal;
        try {
            principal = JSON.writeValueAsString(session.principal());
        } catch (Exception unwritable) {
            throw new IllegalStateException("Cannot store a " + kind + " session", unwritable);
        }
        AppSession row = new AppSession();
        row.setId(id);
        row.setKind(kind);
        row.setPrincipal(principal);
        row.setExpiresAt(session.expiresAt());
        data.write(() -> {
            // Sweeps on every sign-in and refresh rather than on a timer: indexed on expires_at, and nothing else writes here.
            hibernate().createMutationQuery("delete from AppSession where expiresAt < :cutoff")
                    .setParameter("cutoff", Instant.now().minus(GRACE)).executeUpdate();
            // merge: a refresh rewrites the row a sign-in created.
            return hibernate().merge(row);
        });
    }

    @Override
    public Session find(String id) {
        // write, not read: a sign-in may look its session up inside the transaction writing it.
        return data.write(() -> Optional.ofNullable(hibernate().find(AppSession.class, hash(id)))
                .filter(row -> row.getExpiresAt().plus(GRACE).isAfter(Instant.now()))
                .map(row -> {
                    Principal principal = read(row);
                    return principal == null ? null : new Session(id, principal, row.getExpiresAt());
                })
                .orElse(null));
    }

    @Override
    public void delete(String id) {
        data.write(() -> {
            AppSession row = hibernate().find(AppSession.class, hash(id));
            if (row != null) hibernate().remove(row);
        });
    }

    private org.hibernate.Session hibernate() {
        return data.tx().resource(org.hibernate.Session.class);
    }

    private static Principal read(AppSession row) {
        try {
            return JSON.readValue(row.getPrincipal(), KINDS.get(row.getKind()));
        } catch (Exception unreadable) {
            return null;
        }
    }

    private static String hash(String id) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
