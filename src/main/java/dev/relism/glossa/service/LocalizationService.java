package dev.relism.glossa.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.ibm.icu.util.ULocale;
import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Tx;
import dev.relism.flash.ext.data.core.TxException;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.apikey.ApiKeyPrincipal;
import dev.relism.glossa.content.FieldType;
import dev.relism.glossa.content.FieldType.Variable;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.content.Node;
import dev.relism.glossa.persistence.entities.CatalogRelease;
import dev.relism.glossa.persistence.entities.ContentEvent;
import dev.relism.glossa.persistence.entities.ContentRevision;
import dev.relism.glossa.persistence.entities.ContentVariant;
import dev.relism.glossa.persistence.entities.LocalizedResource;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import jakarta.persistence.LockModeType;
import org.hibernate.Session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Resources, their revisions, review and published catalogs (§5–§10), shared by every transport. Roles are
 * checked by {@code @RolesAllowed} on each route; only what depends on the data is decided here.
 */
public final class LocalizationService {

    public record LocaleRequest(String locale, boolean source, String fallbackLocale) {}

    /** {@code cardinal} and {@code ordinal} map each CLDR category this locale needs to its sample numbers. */
    public record LocaleView(String locale, boolean source, String fallbackLocale, boolean rtl,
                             Map<String, List<String>> cardinal, Map<String, List<String>> ordinal) {
        static LocaleView of(ProjectLocale l) {
            return new LocaleView(l.getLocale(), l.isSource(), l.getFallbackLocale(), ULocale.forLanguageTag(l.getLocale()).isRightToLeft(),
                    MessageType.forms(l.getLocale(), false), MessageType.forms(l.getLocale(), true));
        }
    }

    public record CreateResource(String key, String context, String fieldType, Map<String, Object> payload, Map<String, Variable> contract) {}

    public record Edit(Long expectedHeadRevisionId, Long sourceRevisionId, Map<String, Object> payload, Map<String, Variable> contract) {}

    public record Decision(long revisionId, boolean approve) {}

    public record Revert(long revisionId, Long expectedHeadRevisionId, Long sourceRevisionId) {}

    /** {@code payload} is what this locale currently serves, null until something is approved here. */
    public record ResourceView(long id, String key, String context, String fieldType, boolean archived, Long sourceRevisionId,
                               Long headRevisionId, Long approvedRevisionId, Long pendingRevisionId, boolean stale,
                               Map<String, Object> sourcePayload, Map<String, Object> payload) {}

    public record RevisionView(long id, String locale, Long basedOnSourceRevisionId, Map<String, Object> payload,
                               Map<String, Variable> contract, String actor, boolean machine, Instant createdAt) {}

    public record EventView(long id, Long revisionId, Long beforeRevisionId, Long afterRevisionId, String action, String actor, Instant createdAt) {
        static EventView of(ContentEvent e) {
            return new EventView(e.getId(), e.getRevisionId(), e.getBeforeRevisionId(), e.getAfterRevisionId(), e.getAction(), e.getActor(), e.getCreatedAt());
        }
    }

    public record Detail(ResourceView resource, List<RevisionView> revisions, List<EventView> events) {}

    public record ReleaseView(long version, String locale, String hash, Instant createdAt) {
        static ReleaseView of(CatalogRelease r) {
            return new ReleaseView(r.getId(), r.getLocale(), r.getHash(), r.getCreatedAt());
        }
    }

    /** An editor sends the tree it edits; anything holding raw syntax sends the payload. */
    public record MessageRequest(Map<String, Object> payload, List<Node> structure, Map<String, Variable> contract,
                                 Map<String, Object> values, boolean complete) {}

    public record Rendered(String text, String resolvedLocale, long revisionId) {}

    private record Resolved(ContentRevision revision, String locale) {}

    /** A variant and its approved revision, which is null until something is approved in it. */
    private record Current(ContentVariant variant, ContentRevision approved) {}

    private final Data data;
    private final ObjectMapper json;
    private final MessageType messages = new MessageType();
    /** §3's registry: the field types a resource may name. */
    private final Map<String, FieldType> types = Map.of(messages.name(), messages);

    public LocalizationService(Data data, ObjectMapper json) {
        this.data = data;
        this.json = json;
    }

    /** Every locale path or argument must match an enabled locale exactly, so the role check and the data agree on it. */
    public List<LocaleView> locales(long project) {
        return inProject(project, false, () -> localesOf(project).stream().map(LocaleView::of).toList());
    }

    public LocaleView configureLocale(long project, LocaleRequest request) {
        String locale = MessageType.locale(request.locale());
        String fallback = request.fallbackLocale() == null ? null : MessageType.locale(request.fallbackLocale());
        if (request.source() && fallback != null) throw HttpException.badRequest("The source locale can't have a fallback.");
        return inProject(project, true, () -> {
            List<ProjectLocale> locales = localesOf(project);
            ProjectLocale source = locales.stream().filter(ProjectLocale::isSource).findFirst().orElse(null);
            if (source == null && !request.source()) throw HttpException.conflict("Add the source locale first.");
            if (source != null && request.source() != source.getLocale().equals(locale)) {
                throw HttpException.conflict("The source locale can't change.");
            }
            Map<String, String> fallbacks = new HashMap<>();
            locales.forEach(l -> fallbacks.put(l.getLocale(), l.getFallbackLocale()));
            if (fallback != null && !fallbacks.containsKey(fallback)) throw HttpException.badRequest("Enable " + fallback + " first.");
            fallbacks.put(locale, fallback);
            Set<String> seen = new HashSet<>();
            for (String current = locale; current != null; current = fallbacks.get(current)) {
                if (!seen.add(current)) throw HttpException.badRequest("Fallbacks can't form a cycle.");
            }
            ProjectLocale row = locales.stream().filter(l -> l.getLocale().equals(locale)).findFirst().orElseGet(ProjectLocale::new);
            row.setProjectId(project);
            row.setLocale(locale);
            row.setSource(request.source());
            row.setFallbackLocale(fallback);
            if (row.getId() == null) session().persist(row);
            return LocaleView.of(row);
        });
    }

    /**
     * A translation locale and everything written in it, gone; the source never goes. Its history goes
     * too: §8's log is append-only for a locale that exists, not a reason to keep rows about one that
     * no longer does. Locales that fell back to it fall back to nothing.
     */
    public void removeLocale(long project, String locale) {
        inProject(project, true, () -> {
            if (enabled(project, locale).isSource()) throw HttpException.conflict("The source locale can't be removed.");
            String variants = "select v.id from ContentVariant v where v.projectId = :project and v.locale = :locale";
            String revisions = "select r.id from ContentRevision r where r.variantId in (" + variants + ")";
            // V7: the immutability triggers let deletes through for this transaction only.
            session().createNativeQuery("select set_config('glossa.removing_locale', 'on', true)", String.class).getSingleResult();
            // No foreign key cascades, and variants and revisions point at each other: order is everything.
            mutate("delete from ContentEvent where revisionId in (" + revisions + ") or beforeRevisionId in (" + revisions
                    + ") or afterRevisionId in (" + revisions + ")", project, locale);
            mutate("update ContentVariant set headRevisionId = null, approvedRevisionId = null, pendingRevisionId = null"
                    + " where projectId = :project and locale = :locale", project, locale);
            mutate("delete from ContentRevision where variantId in (" + variants + ")", project, locale);
            mutate("delete from ContentVariant where projectId = :project and locale = :locale", project, locale);
            mutate("delete from CatalogRelease where projectId = :project and locale = :locale", project, locale);
            mutate("update ProjectLocale set fallbackLocale = null where projectId = :project and fallbackLocale = :locale", project, locale);
            mutate("delete from ProjectLocale where projectId = :project and locale = :locale", project, locale);
            return null;
        });
    }

    private void mutate(String query, long project, String locale) {
        session().createMutationQuery(query).setParameter("project", project).setParameter("locale", locale).executeUpdate();
    }

    /** Three queries however many resources the project holds: its locales, its resources, and both locales' variants with their approved revisions. */
    public List<ResourceView> list(long project, String locale, String prefix) {
        return inProject(project, false, () -> {
            List<ProjectLocale> locales = localesOf(project);
            String origin = source(locales).getLocale();
            enabled(locales, locale);
            Map<String, Current> current = new HashMap<>();
            session().createQuery("select v, r from ContentVariant v left join ContentRevision r on r.id = v.approvedRevisionId"
                            + " where v.projectId = :project and v.locale in (:locales)", Object[].class)
                    .setParameter("project", project).setParameterList("locales", List.of(origin, locale)).getResultStream()
                    .forEach(row -> {
                        ContentVariant variant = (ContentVariant) row[0];
                        current.put(variant.getLocale() + "/" + variant.getResourceId(), new Current(variant, (ContentRevision) row[1]));
                    });
            return session().createQuery("from LocalizedResource where projectId = :project order by key", LocalizedResource.class)
                    .setParameter("project", project).getResultStream()
                    .filter(resource -> prefix == null || resource.getKey().startsWith(prefix))
                    .map(resource -> {
                        Current source = current.get(origin + "/" + resource.getId());
                        Current here = current.getOrDefault(locale + "/" + resource.getId(), new Current(null, null));
                        if (source == null || source.approved() == null) throw noSource();
                        return view(resource, source.approved(), here.variant(), here.approved());
                    })
                    .toList();
        });
    }

    /** The resource and its first source revision, approved at once. */
    public ResourceView create(long project, CreateResource request) {
        if (request.key() == null || !request.key().matches("[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}")) {
            throw HttpException.badRequest("Use up to 255 letters, digits, _, . and - for the key.");
        }
        if (request.context() != null && request.context().length() > 255) throw HttpException.badRequest("Keep the context under 256 characters.");
        FieldType type = type(request.fieldType());
        // §3: leaving the contract out asks the field type to read it off the message itself.
        Map<String, Variable> contract = request.contract() != null ? request.contract() : type.contractOf(request.payload());
        return inProject(project, true, () -> {
            String locale = source(project).getLocale();
            boolean taken = session().createQuery("select count(*) from LocalizedResource where projectId = :project and key = :key", Long.class)
                    .setParameter("project", project).setParameter("key", request.key()).getSingleResult() > 0;
            if (taken) throw HttpException.conflict("That key already exists.");
            type.validate(request.payload(), contract, locale, false);
            LocalizedResource resource = new LocalizedResource();
            resource.setProjectId(project);
            resource.setKey(request.key());
            resource.setContext(request.context());
            resource.setFieldType(type.name());
            session().persist(resource);
            append(resource, variant(resource, locale, true), request.payload(), contract, null, true, "CREATE");
            return view(resource, locale);
        });
    }

    public ResourceView edit(long project, long id, String locale, Edit edit) {
        return write(project, id, locale, edit, null);
    }

    /** A new revision carrying an old one's value: history is never rewritten (§8). */
    public ResourceView revert(long project, long id, String locale, Revert request) {
        return write(project, id, locale, new Edit(request.expectedHeadRevisionId(), request.sourceRevisionId(), null, null), request.revisionId());
    }

    public ResourceView review(long project, long id, String locale, Decision decision) {
        boolean machine = machine();
        return inProject(project, true, () -> {
            LocalizedResource resource = active(project, id);
            ContentVariant variant = variant(resource, locale, false);
            if (variant == null || !Objects.equals(variant.getPendingRevisionId(), decision.revisionId())) {
                throw HttpException.conflict("That proposal is no longer pending.");
            }
            ContentRevision revision = session().find(ContentRevision.class, decision.revisionId());
            if (revision.isMachine() && machine) throw HttpException.forbidden("A machine proposal needs human review.");
            Long approved = variant.getApprovedRevisionId();
            if (decision.approve()) {
                if (!Objects.equals(revision.getBasedOnSourceRevisionId(), sourceRevision(resource).getId())) {
                    throw HttpException.conflict("The source changed after this proposal.");
                }
                type(resource.getFieldType()).validate(revision.getPayload(), revision.getContract(), locale, false);
                variant.setApprovedRevisionId(revision.getId());
                event(resource, revision.getId(), "APPROVE", approved, revision.getId());
            } else {
                event(resource, revision.getId(), "REJECT", approved, approved);
            }
            variant.setPendingRevisionId(null);
            return view(resource, locale);
        });
    }

    public ResourceView archive(long project, long id, boolean archived) {
        return inProject(project, true, () -> {
            LocalizedResource resource = resource(project, id);
            if (resource.isArchived() != archived) {
                resource.setArchived(archived);
                event(resource, null, archived ? "ARCHIVE" : "RESTORE", null, null);
            }
            return view(resource, source(project).getLocale());
        });
    }

    /** The resource with its source and {@code locale} revisions, and the log entries about them. */
    public Detail detail(long project, long id, String locale) {
        return inProject(project, false, () -> {
            enabled(project, locale);
            LocalizedResource resource = resource(project, id);
            Map<Long, String> variants = session().createQuery("from ContentVariant where resourceId = :resource and locale in (:locales)", ContentVariant.class)
                    .setParameter("resource", id).setParameterList("locales", List.of(locale, source(project).getLocale())).getResultStream()
                    .collect(Collectors.toMap(ContentVariant::getId, ContentVariant::getLocale));
            List<RevisionView> revisions = session().createQuery("from ContentRevision where variantId in (:variants) order by id", ContentRevision.class)
                    .setParameterList("variants", variants.keySet()).getResultStream()
                    .map(r -> new RevisionView(r.getId(), variants.get(r.getVariantId()), r.getBasedOnSourceRevisionId(), r.getPayload(),
                            r.getContract(), r.getActor(), r.isMachine(), r.getCreatedAt()))
                    .toList();
            Set<Long> shown = revisions.stream().map(RevisionView::id).collect(Collectors.toSet());
            List<EventView> events = session().createQuery("from ContentEvent where resourceId = :resource order by id", ContentEvent.class)
                    .setParameter("resource", id).getResultStream()
                    .filter(e -> e.getRevisionId() == null || shown.contains(e.getRevisionId()))
                    .map(EventView::of)
                    .toList();
            return new Detail(view(resource, locale), revisions, events);
        });
    }

    public Rendered render(long project, long id, String locale, Map<String, Object> values) {
        return inProject(project, false, () -> {
            enabled(project, locale);
            LocalizedResource resource = active(project, id);
            Resolved resolved = resolve(resource, locale, false);
            ContentRevision revision = resolved.revision();
            String text = type(resource.getFieldType()).render(revision.getPayload(), revision.getContract(), resolved.locale(), values);
            return new Rendered(text, resolved.locale(), revision.getId());
        });
    }

    public MessageType.Analysis analyze(long project, String locale, MessageRequest request) {
        return inProject(project, false, () -> messages.analyze(payloadOf(request), contractOf(request), enabled(project, locale).getLocale(), request.complete()));
    }

    public String preview(long project, String locale, MessageRequest request) {
        return inProject(project, false, () -> messages.render(payloadOf(request), contractOf(request), enabled(project, locale).getLocale(), request.values()));
    }

    private Map<String, Object> payloadOf(MessageRequest request) {
        return request.payload() != null ? request.payload() : messages.payloadOf(request.structure());
    }

    private Map<String, Variable> contractOf(MessageRequest request) {
        return request.contract() != null ? request.contract() : messages.contractOf(payloadOf(request));
    }

    /** Every active resource resolved for {@code locale}; publishing an unchanged catalog returns the current release. */
    public ReleaseView publish(long project, String locale) {
        return inProject(project, true, () -> {
            enabled(project, locale);
            Map<String, Object> entries = new TreeMap<>();
            List<LocalizedResource> resources = session().createQuery("from LocalizedResource where projectId = :project and archived = false", LocalizedResource.class)
                    .setParameter("project", project).getResultList();
            for (LocalizedResource resource : resources) {
                Resolved resolved = resolve(resource, locale, true);
                ContentRevision revision = resolved.revision();
                entries.put(resource.getKey(), Map.of("fieldType", resource.getFieldType(), "payload", revision.getPayload(),
                        "contract", revision.getContract(), "resolvedLocale", resolved.locale(), "revisionId", revision.getId()));
            }
            String artifact = json.writer().with(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsString(Map.of("profile", MessageType.PROFILE,
                    "icuVersion", MessageType.ICU, "cldrVersion", MessageType.CLDR, "locale", locale, "entries", entries));
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(artifact.getBytes(StandardCharsets.UTF_8)));
            CatalogRelease latest = latest(project, locale);
            if (latest != null && latest.getHash().equals(hash)) return ReleaseView.of(latest);
            CatalogRelease release = new CatalogRelease();
            release.setProjectId(project);
            release.setLocale(locale);
            release.setHash(hash);
            release.setArtifact(artifact);
            session().persist(release);
            return ReleaseView.of(release);
        });
    }

    public ReleaseView manifest(long project, String locale) {
        return inProject(project, false, () -> {
            CatalogRelease release = latest(project, locale);
            if (release == null) throw HttpException.notFound("Catalog");
            return ReleaseView.of(release);
        });
    }

    public String catalog(long project, String locale, String hash) {
        return inProject(project, false, () -> session()
                .createQuery("select artifact from CatalogRelease where projectId = :project and locale = :locale and hash = :hash", String.class)
                .setParameter("project", project).setParameter("locale", locale).setParameter("hash", hash)
                .setMaxResults(1).uniqueResultOptional()
                .orElseThrow(() -> HttpException.notFound("Catalog")));
    }

    /**
     * A source edit is a manager's and approved at once. A translation is approved at once when a human reviewer
     * writes it, and is a proposal otherwise (§9). Roles are read before the transaction: a role check reads, and
     * a read cannot join a write.
     */
    private ResourceView write(long project, long id, String locale, Edit edit, Long revertTo) {
        boolean manager = allows(project, null, "MANAGER");
        boolean reviewer = allows(project, locale, "REVIEWER") && !machine();
        return inProject(project, true, () -> {
            enabled(project, locale);
            LocalizedResource resource = active(project, id);
            ContentRevision source = sourceRevision(resource);
            boolean origin = source(project).getLocale().equals(locale);
            if (origin && !manager) throw HttpException.forbidden("Only a manager can edit the source.");
            ContentVariant variant = variant(resource, locale, true);
            long head = Objects.requireNonNullElse(variant.getHeadRevisionId(), 0L);
            if (edit.expectedHeadRevisionId() == null || edit.expectedHeadRevisionId() != head) {
                throw HttpException.conflict("This value changed. Refresh and try again.");
            }
            if (variant.getPendingRevisionId() != null) throw HttpException.conflict("Review the pending proposal first.");
            if (!origin && !Objects.equals(edit.sourceRevisionId(), source.getId())) {
                throw HttpException.conflict("The source changed. Refresh and try again.");
            }
            Map<String, Object> payload = edit.payload();
            Map<String, Variable> contract = origin ? edit.contract() : source.getContract();
            if (revertTo != null) {
                ContentRevision previous = session().find(ContentRevision.class, revertTo);
                if (previous == null || !previous.getVariantId().equals(variant.getId())) throw HttpException.notFound("Revision");
                payload = previous.getPayload();
                if (origin) contract = previous.getContract();
            } else if (!origin && edit.contract() != null && !edit.contract().equals(contract)) {
                throw HttpException.badRequest("A translation keeps the source's variables.");
            }
            FieldType type = type(resource.getFieldType());
            // A source write may leave the contract out; a translation never has the choice.
            if (contract == null) contract = type.contractOf(payload);
            type.validate(payload, contract, locale, false);
            append(resource, variant, payload, contract, origin ? null : source.getId(), origin || reviewer, revertTo == null ? "EDIT" : "REVERT");
            return view(resource, locale);
        });
    }

    private void append(LocalizedResource resource, ContentVariant variant, Map<String, Object> payload, Map<String, Variable> contract,
                        Long sourceId, boolean approve, String action) {
        ContentRevision revision = new ContentRevision();
        revision.setVariantId(variant.getId());
        revision.setBasedOnSourceRevisionId(sourceId);
        revision.setPayload(payload);
        revision.setContract(contract);
        revision.setActor(actor());
        revision.setMachine(machine());
        session().persist(revision);
        Long approved = variant.getApprovedRevisionId();
        variant.setHeadRevisionId(revision.getId());
        if (approve) {
            variant.setApprovedRevisionId(revision.getId());
            event(resource, revision.getId(), action, approved, revision.getId());
        } else {
            variant.setPendingRevisionId(revision.getId());
            event(resource, revision.getId(), "PROPOSE", approved, approved);
        }
    }

    private void event(LocalizedResource resource, Long revision, String action, Long before, Long after) {
        ContentEvent event = new ContentEvent();
        event.setResourceId(resource.getId());
        event.setRevisionId(revision);
        event.setBeforeRevisionId(before);
        event.setAfterRevisionId(after);
        event.setAction(action);
        event.setActor(actor());
        session().persist(event);
    }

    /**
     * The first current approved value along {@code locale}'s fallback chain, which {@link #configureLocale} keeps
     * acyclic. A stale translation is skipped as a whole message, never mixed with its source.
     */
    private Resolved resolve(LocalizedResource resource, String locale, boolean complete) {
        ContentRevision source = sourceRevision(resource);
        for (String current = locale; current != null; current = enabled(resource.getProjectId(), current).getFallbackLocale()) {
            ContentVariant variant = variant(resource, current, false);
            if (variant == null || variant.getApprovedRevisionId() == null) continue;
            ContentRevision revision = session().find(ContentRevision.class, variant.getApprovedRevisionId());
            if (stale(revision, source)) continue;
            type(resource.getFieldType()).validate(revision.getPayload(), revision.getContract(), current, complete);
            return new Resolved(revision, current);
        }
        throw HttpException.conflict("Nothing approved to show for " + resource.getKey() + ".");
    }

    private ResourceView view(LocalizedResource resource, String locale) {
        ContentVariant variant = variant(resource, locale, false);
        return view(resource, sourceRevision(resource), variant,
                variant == null || variant.getApprovedRevisionId() == null ? null : session().find(ContentRevision.class, variant.getApprovedRevisionId()));
    }

    /** {@code variant} and {@code approved} are null where nothing was written, or nothing approved, in the locale. */
    private static ResourceView view(LocalizedResource resource, ContentRevision source, ContentVariant variant, ContentRevision approved) {
        ContentVariant shown = variant == null ? new ContentVariant() : variant;
        return new ResourceView(resource.getId(), resource.getKey(), resource.getContext(), resource.getFieldType(), resource.isArchived(), source.getId(),
                shown.getHeadRevisionId(), shown.getApprovedRevisionId(), shown.getPendingRevisionId(), approved != null && stale(approved, source),
                source.getPayload(), approved == null ? null : approved.getPayload());
    }

    private static boolean stale(ContentRevision translation, ContentRevision source) {
        return translation.getBasedOnSourceRevisionId() != null && !translation.getBasedOnSourceRevisionId().equals(source.getId());
    }

    private ContentRevision sourceRevision(LocalizedResource resource) {
        ContentVariant variant = variant(resource, source(resource.getProjectId()).getLocale(), false);
        if (variant == null || variant.getApprovedRevisionId() == null) throw noSource();
        return session().find(ContentRevision.class, variant.getApprovedRevisionId());
    }

    private static HttpException noSource() {
        return HttpException.conflict("This resource has no approved source.");
    }

    private ContentVariant variant(LocalizedResource resource, String locale, boolean create) {
        ContentVariant variant = session().createQuery("from ContentVariant where resourceId = :resource and locale = :locale", ContentVariant.class)
                .setParameter("resource", resource.getId()).setParameter("locale", locale).uniqueResult();
        if (variant == null && create) {
            variant = new ContentVariant();
            variant.setResourceId(resource.getId());
            variant.setProjectId(resource.getProjectId());
            variant.setLocale(locale);
            session().persist(variant);
        }
        return variant;
    }

    private LocalizedResource resource(long project, long id) {
        LocalizedResource resource = session().find(LocalizedResource.class, id);
        if (resource == null || resource.getProjectId() != project) throw HttpException.notFound("Resource");
        return resource;
    }

    private LocalizedResource active(long project, long id) {
        LocalizedResource resource = resource(project, id);
        if (resource.isArchived()) throw HttpException.conflict("This resource is archived.");
        return resource;
    }

    private CatalogRelease latest(long project, String locale) {
        return session().createQuery("from CatalogRelease where projectId = :project and locale = :locale order by id desc", CatalogRelease.class)
                .setParameter("project", project).setParameter("locale", locale).setMaxResults(1).uniqueResult();
    }

    private List<ProjectLocale> localesOf(long project) {
        return session().createQuery("from ProjectLocale where projectId = :project order by locale", ProjectLocale.class)
                .setParameter("project", project).getResultList();
    }

    private ProjectLocale source(long project) {
        return source(localesOf(project));
    }

    private static ProjectLocale source(List<ProjectLocale> locales) {
        return locales.stream().filter(ProjectLocale::isSource).findFirst().orElseThrow(() -> HttpException.conflict("Add a source locale first."));
    }

    private ProjectLocale enabled(long project, String locale) {
        return enabled(localesOf(project), locale);
    }

    private static ProjectLocale enabled(List<ProjectLocale> locales, String locale) {
        return locales.stream().filter(l -> l.getLocale().equals(locale)).findFirst()
                .orElseThrow(() -> HttpException.badRequest(locale + " isn't enabled on this project."));
    }

    private FieldType type(String name) {
        FieldType type = name == null ? null : types.get(name);
        if (type == null) throw HttpException.badRequest("Unknown field type: " + name + ".");
        return type;
    }

    /** Runs {@code work} on an existing project, locked for a write so that one project's writes serialize. */
    private <T> T inProject(long project, boolean write, Tx.TxCallable<T> work) {
        Tx.TxCallable<T> body = () -> {
            // ponytail: one lock per project; lock the resource row instead if concurrent edits contend.
            if (session().find(Project.class, project, write ? LockModeType.PESSIMISTIC_WRITE : LockModeType.NONE) == null) {
                throw HttpException.notFound("Project");
            }
            return work.call();
        };
        try {
            return write ? data.write(body) : data.read(body);
        } catch (TxException failure) {
            if (failure.getCause() instanceof HttpException http) throw http;
            throw failure;
        }
    }

    private Session session() {
        return data.tx().resource(Session.class);
    }

    private static boolean allows(long project, String locale, String role) {
        return SecurityIdentity.current().hasRole(role, name -> switch (name) {
            case "project" -> Long.toString(project);
            case "locale" -> locale;
            default -> null;
        });
    }

    private static String actor() {
        return SecurityIdentity.current().principal().name();
    }

    private static boolean machine() {
        return SecurityIdentity.current().principal(ApiKeyPrincipal.class) != null;
    }
}
