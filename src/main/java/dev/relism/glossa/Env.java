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
 * credentials to it. Nothing here is required: a fresh clone boots with built-in sign-in.
 */
public final class Env {

    private static final Map<String, String> DOTENV = loadDotEnv();

    public static final int PORT = Integer.parseInt(get("PORT", "8080"));

    public static final String DB_URL      = get("DB_URL", "jdbc:postgresql://localhost:5432/glossa");
    public static final String DB_USERNAME = get("DB_USERNAME", "glossa");
    public static final String DB_PASSWORD = get("DB_PASSWORD", "glossa");

    /** §11: SSO is installed when an issuer is configured; {@code {origin}/auth/oidc/sso/callback} is its redirect URI. */
    public static final String OIDC_ISSUER        = get("OIDC_ISSUER", null);
    public static final String OIDC_CLIENT_ID     = get("OIDC_CLIENT_ID", null);
    public static final String OIDC_CLIENT_SECRET = get("OIDC_CLIENT_SECRET", null);
    public static final String OIDC_SCOPES        = get("OIDC_SCOPES", "openid profile email");

    /** §11: password sign-in, on unless disabled. */
    public static final boolean LOCAL_LOGIN = !"false".equalsIgnoreCase(get("LOCAL_LOGIN", "true"));

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
