package dev.relism.glossa;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * A real environment variable always wins; otherwise a {@code .env} file in the working
 * directory is used (see {@code .env.example}) — {@code .env} is gitignored, never commit real
 * credentials to it.
 *
 * <p>Nothing here is {@code required()}: the app must boot in a fresh clone and under
 * {@code mvn test} before anyone has stood up an identity provider. OIDC is therefore
 * opt-in — {@link Main} installs it only once {@link #OIDC_ISSUER} is set. That is a
 * development affordance, not a deployment one: §11 of {@code docs/REQUIREMENTS.md} makes SSO
 * mandatory for human users, so a real deployment always sets these.
 */
public final class Env {

    private static final Map<String, String> DOTENV = loadDotEnv();

    public static final int PORT = Integer.parseInt(get("PORT", "8080"));

    public static final String DB_URL      = get("DB_URL", "jdbc:postgresql://localhost:5432/glossa");
    public static final String DB_USERNAME = get("DB_USERNAME", "glossa");
    public static final String DB_PASSWORD = get("DB_PASSWORD", "glossa");

    /** The LibreTranslate sidecar that backs automatic suggestions (§2, §9). */
    public static final String LIBRETRANSLATE_URL = get("LIBRETRANSLATE_URL", "http://localhost:5000");

    public static final String OIDC_ISSUER        = get("OIDC_ISSUER", null);
    public static final String OIDC_CLIENT_ID     = get("OIDC_CLIENT_ID", null);
    public static final String OIDC_CLIENT_SECRET = get("OIDC_CLIENT_SECRET", null);
    public static final String OIDC_REDIRECT_URI  = get("OIDC_REDIRECT_URI", "/auth/callback");
    public static final String OIDC_SCOPES        = get("OIDC_SCOPES", "openid profile email");
    public static final String OIDC_ROUTE_PREFIX  = get("OIDC_ROUTE_PREFIX", "/auth");

    /**
     * Scheme for the absolute URLs Glossa publishes about itself (the login {@code redirect_uri},
     * and the MCP resource identifier both the RFC 9728 document and the token's {@code aud} are
     * checked against). Only consulted when a request carries no {@code X-Forwarded-Proto}, i.e.
     * when Glossa is reached directly rather than through a TLS-terminating proxy — and that is
     * plain HTTP, so {@code http} is the right fallback.
     */
    public static final String OIDC_SELF_SCHEME = get("OIDC_SELF_SCHEME", "http");

    /** Claim path project/organization roles are read from — shared by OIDC, MCP and the API layer. */
    public static final String OIDC_ROLES_CLAIM = get("OIDC_ROLES_CLAIM", "realm_access.roles");

    private Env() {}

    private static String get(String key, String fallback) {
        String v = System.getenv(key);
        if (v == null || v.isBlank()) v = DOTENV.get(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }

    private static Map<String, String> loadDotEnv() {
        Path path = Path.of(".env");
        if (!Files.isReadable(path)) return Map.of();
        Map<String, String> values = new HashMap<>();
        try {
            for (String line : Files.readAllLines(path)) {
                String trimmed = line.strip();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                int eq = trimmed.indexOf('=');
                if (eq <= 0) continue;
                values.put(trimmed.substring(0, eq).strip(), trimmed.substring(eq + 1).strip());
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read .env", e);
        }
        return values;
    }
}
