package dev.relism.glossa.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.schema.Localization.ReleaseView;
import dev.relism.glossa.schema.Projects.WebhookView;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** A project's webhook: one signed POST per new release, so a consumer can fetch it instead of polling (§10). */
@Slf4j
@RequiredArgsConstructor
public final class WebhookService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private final Data data;
    private final ObjectMapper json;

    public WebhookView view(long project) {
        return new WebhookView(project(project).getWebhookUrl(), null);
    }

    /** A new URL gets a new secret, answered this once; null or blank removes the webhook. */
    public WebhookView configure(long project, String url) {
        Project row = project(project);
        String secret = null;
        if (url == null || url.isBlank()) {
            row.setWebhookUrl(null);
            row.setWebhookSecret(null);
        } else {
            URI uri;
            try {
                uri = URI.create(url.strip());
            } catch (IllegalArgumentException bad) {
                throw HttpException.badRequest("That is not a URL.");
            }
            if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null) {
                throw HttpException.badRequest("The webhook needs an http or https URL.");
            }
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            secret = HexFormat.of().formatHex(bytes);
            row.setWebhookUrl(uri.toString());
            row.setWebhookSecret(Secrets.encrypt(secret));
        }
        data.write(() -> data.repository(Project.class).update(row));
        return new WebhookView(row.getWebhookUrl(), secret);
    }

    /**
     * Announces a new release after its transaction committed. Fire and forget: a consumer that was
     * down catches up from the manifest.
     */
    // ponytail: no retries and no delivery log; add both if a consumer can't poll the manifest to catch up.
    public void published(long project, ReleaseView release) {
        Project row = project(project);
        if (row.getWebhookUrl() == null) return;
        String body;
        try {
            body = json.writeValueAsString(Map.of("event", "release.published", "project", row.getSlug(), "locale", release.locale(),
                    "version", release.version(), "hash", release.hash(), "createdAt", release.createdAt().toString()));
        } catch (JsonProcessingException unwritable) {
            throw HttpException.internal("Could not write the webhook body.");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(row.getWebhookUrl()))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("X-Glossa-Signature", "sha256=" + sign(Secrets.decrypt(row.getWebhookSecret()), body))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HTTP.sendAsync(request, HttpResponse.BodyHandlers.discarding()).whenComplete((response, failure) -> {
            if (failure != null) log.warn("Webhook of project {} failed: {}", project, failure.toString());
            else if (response.statusCode() / 100 != 2) log.warn("Webhook of project {} answered {}", project, response.statusCode());
        });
    }

    /** Hex HMAC-SHA256 of the body, which the receiver recomputes with the same secret. */
    public static String sign(String secret, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private Project project(long id) {
        return data.repository(Project.class).findById(id).orElseThrow(() -> HttpException.notFound("Project"));
    }
}
