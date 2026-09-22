package dev.relism.glossa.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.glossa.persistence.entities.AiSettings;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * §9's provider: one chat completion against any OpenAI-compatible API. Holds no conversation and
 * stores nothing — a feature asks, shows the answer to whoever asked, and that is the end of it.
 */
public final class AiService {

    /**
     * Where AI calls may go, for a build sourcing the provider somewhere other than this
     * installation's own settings — per tenant, say. Unset, {@link #settings()} is used.
     */
    public interface Access {

        /** The provider to call, or a thrown {@link HttpException} explaining why no call may be made. */
        Endpoint endpoint();

        /**
         * One AI action the caller asked for succeeded. A feature reports it once, whatever it took
         * internally: a retry is the same action, not a second one.
         */
        default void used() {}
    }

    public record Endpoint(String baseUrl, String apiKey, String model) {}

    public record Completion(String text, String model) {}

    /** {@code apiKey} is never returned; {@code configured} says whether one is stored. */
    public record SettingsView(boolean enabled, String baseUrl, String model, boolean configured) {}

    /** A null {@code apiKey} keeps the stored one, so the form can be saved without retyping it. */
    public record SettingsUpdate(boolean enabled, String baseUrl, String model, String apiKey) {}

    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private final Data data;
    private final ObjectMapper json;
    private final Access access;

    /** @param access null in an installation that configures its own provider */
    public AiService(Data data, ObjectMapper json, Access access) {
        this.data = data;
        this.json = json;
        this.access = access;
    }

    public SettingsView settings() {
        AiSettings row = row();
        return new SettingsView(row.isEnabled(), row.getBaseUrl(), row.getModel(), row.getApiKey() != null);
    }

    public SettingsView configure(SettingsUpdate request) {
        AiSettings row = row();
        row.setEnabled(request.enabled());
        row.setBaseUrl(trimmed(request.baseUrl()));
        row.setModel(trimmed(request.model()));
        if (trimmed(request.apiKey()) != null) row.setApiKey(Secrets.encrypt(trimmed(request.apiKey())));
        if (row.isEnabled() && (row.getBaseUrl() == null || row.getModel() == null || row.getApiKey() == null)) {
            throw HttpException.badRequest("Fill in the provider URL, model and key first.");
        }
        data.write(() -> data.repository(AiSettings.class).update(row));
        return settings();
    }

    /** One AI action the caller asked for succeeded. */
    public void used() {
        if (access != null) access.used();
    }

    /** The provider's answer, or 502: a provider that is slow, down or lying is not the caller's fault. */
    public Completion complete(String system, String user) {
        Endpoint endpoint = access != null ? access.endpoint() : configured();
        HttpResponse<String> response;
        try {
            String body = json.writeValueAsString(Map.of(
                    "model", endpoint.model(),
                    // Low, not zero: a translation is not a lookup, and zero makes some providers loop.
                    "temperature", 0.2,
                    "messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user))));
            response = HTTP.send(HttpRequest.newBuilder(URI.create(endpoint.baseUrl().replaceAll("/+$", "") + "/chat/completions"))
                    .timeout(TIMEOUT)
                    .header("Authorization", "Bearer " + endpoint.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build(), HttpResponse.BodyHandlers.ofString());
        } catch (IllegalArgumentException badUrl) {
            throw HttpException.badRequest("The AI provider URL is not usable.");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new HttpException(502, "The AI provider did not answer.");
        } catch (IOException unreachable) {
            throw new HttpException(502, "The AI provider did not answer.");
        }
        if (response.statusCode() / 100 != 2) throw new HttpException(502, "The AI provider refused the request (" + response.statusCode() + ").");
        JsonNode content;
        try {
            content = json.readTree(response.body()).path("choices").path(0).path("message").path("content");
        } catch (JsonProcessingException unreadable) {
            throw new HttpException(502, "The AI provider's answer could not be read.");
        }
        if (!content.isTextual() || content.asText().isBlank()) throw new HttpException(502, "The AI provider answered nothing.");
        // Models wrap code in fences however plainly they are told not to. Only the fences and the
        // newlines around the answer go: a message's own spaces and tabs are part of its value.
        String text = content.asText().replaceAll("^\\s*```[a-zA-Z]*\\n|\\n```\\s*$", "").replaceAll("^[\\r\\n]+|[\\r\\n]+$", "");
        return new Completion(text, endpoint.model());
    }

    private Endpoint configured() {
        AiSettings row = row();
        if (!row.isEnabled()) throw HttpException.forbidden("AI features are off.");
        if (row.getBaseUrl() == null || row.getApiKey() == null || row.getModel() == null) {
            throw HttpException.forbidden("AI features are not configured.");
        }
        return new Endpoint(row.getBaseUrl(), Secrets.decrypt(row.getApiKey()), row.getModel());
    }

    private AiSettings row() {
        return data.repository(AiSettings.class).findById(AiSettings.ROW).orElseThrow(() -> HttpException.internal("AI settings row is missing."));
    }

    private static String trimmed(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
