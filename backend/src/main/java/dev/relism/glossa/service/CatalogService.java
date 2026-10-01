package dev.relism.glossa.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Query;
import dev.relism.flash.ext.data.core.Sort;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.persistence.entities.CatalogRelease;
import dev.relism.glossa.persistence.entities.LocalizedResource;
import dev.relism.glossa.schema.Localization.ReleaseView;
import dev.relism.glossa.service.ContentQueries.ResolvedEntry;
import dev.relism.glossa.service.LocalizationService.Resolved;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** §10's published catalogs: one immutable artifact per release, addressed by its own hash. */
public final class CatalogService extends ProjectScoped {

    private static final SpecBuilder.FieldSpec<CatalogRelease, Long> RELEASE_PROJECT = SpecBuilder.field("projectId");
    private static final SpecBuilder.FieldSpec<CatalogRelease, String> RELEASE_LOCALE = SpecBuilder.field("locale");
    private static final SpecBuilder.FieldSpec<LocalizedResource, Long> RESOURCE_PROJECT = SpecBuilder.field("projectId");
    private static final SpecBuilder.FieldSpec<LocalizedResource, Boolean> RESOURCE_ARCHIVED = SpecBuilder.field("archived");

    private final ObjectMapper json;
    private final ContentQueries queries;
    private final LocalizationService content;
    private final WebhookService webhooks;

    public CatalogService(Data data, ObjectMapper json, ContentQueries queries, LocalizationService content, WebhookService webhooks) {
        super(data);
        this.json = json;
        this.queries = queries;
        this.content = content;
        this.webhooks = webhooks;
    }

    /** Every active resource resolved for {@code locale}; publishing an unchanged catalog returns the current release. */
    public ReleaseView publish(long project, String locale) {
        boolean[] fresh = {false};
        ReleaseView published = inProject(project, true, () -> {
            enabled(project, locale);
            Map<String, Object> entries = new TreeMap<>();
            List<LocalizedResource> resources = data.repository(LocalizedResource.class)
                    .findAll(RESOURCE_PROJECT.eq(project).and(RESOURCE_ARCHIVED.eq(false)));
            for (LocalizedResource resource : resources) {
                Resolved resolved = content.resolve(resource, locale, true);
                entries.put(resource.getKey(), Map.of("fieldType", resource.getFieldType(), "payload", resolved.revision().getPayload(),
                        "contract", resolved.revision().getContract(), "resolvedLocale", resolved.locale(), "revisionId", resolved.revision().getId()));
            }
            String artifact = json.writer().with(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsString(Map.of("profile", MessageType.PROFILE,
                    "icuVersion", MessageType.ICU, "cldrVersion", MessageType.CLDR, "locale", locale, "entries", entries));
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(artifact.getBytes(StandardCharsets.UTF_8)));
            CatalogRelease latest = latest(project, locale);
            if (latest != null && latest.getHash().equals(hash)) return view(latest);
            CatalogRelease release = new CatalogRelease();
            release.setProjectId(project);
            release.setLocale(locale);
            release.setHash(hash);
            release.setArtifact(artifact);
            data.repository(CatalogRelease.class).save(release);
            fresh[0] = true;
            return view(release);
        });
        // After the commit, so whoever the webhook tells can already fetch the release.
        if (fresh[0]) webhooks.published(project, published);
        return published;
    }

    public ReleaseView manifest(long project, String locale) {
        return inProject(project, false, () -> {
            CatalogRelease release = latest(project, locale);
            if (release == null) throw HttpException.notFound("Catalog");
            return view(release);
        });
    }

    public String catalog(long project, String locale, String hash) {
        return inProject(project, false, () -> queries.artifact(project, locale, hash)
                .orElseThrow(() -> HttpException.notFound("Catalog")));
    }

    CatalogRelease latest(long project, String locale) {
        return data.repository(CatalogRelease.class)
                .findAll(Query.<CatalogRelease>all().where(RELEASE_PROJECT.eq(project).and(RELEASE_LOCALE.eq(locale)))
                        .orderBy(Sort.desc("id")).page(0, 1))
                .stream().findFirst().orElse(null);
    }

    /**
     * Whether {@code release} already holds exactly what publishing would produce, so progress can
     * offer the action without rebuilding every catalog. {@code resolved_entry} answers what each
     * resource would resolve to; a resource that resolves to nothing is absent from it, so the live
     * count has to agree too — publishing would refuse, and that is not a current catalog.
     */
    boolean current(CatalogRelease release, long project, String locale) {
        if (release == null) return false;
        try {
            JsonNode artifact = json.readTree(release.getArtifact());
            JsonNode entries = artifact.path("entries");
            if (!MessageType.PROFILE.equals(artifact.path("profile").asText())
                    || !MessageType.ICU.equals(artifact.path("icuVersion").asText())
                    || !MessageType.CLDR.equals(artifact.path("cldrVersion").asText())
                    || !locale.equals(artifact.path("locale").asText())
                    || !entries.isObject()) return false;
            List<ResolvedEntry> resolved = queries.resolvedEntries(project, locale);
            if (entries.size() != resolved.size() || resolved.size() != queries.liveResources(project)) return false;
            return resolved.stream().allMatch(entry -> {
                JsonNode published = entries.get(entry.key());
                return published != null && published.path("revisionId").asLong() == entry.revisionId()
                        && entry.resolvedLocale().equals(published.path("resolvedLocale").asText());
            });
        } catch (IOException unreadable) {
            throw HttpException.internal("Could not read the current catalog.");
        }
    }

    /** A release's version counts its own locale's releases, not every locale's. */
    ReleaseView view(CatalogRelease r) {
        return new ReleaseView(queries.releaseVersion(r.getProjectId(), r.getLocale(), r.getId()), r.getLocale(), r.getHash(), r.getCreatedAt());
    }
}
