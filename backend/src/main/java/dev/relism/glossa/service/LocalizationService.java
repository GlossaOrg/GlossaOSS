package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Query;
import dev.relism.flash.ext.data.core.Sort;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.content.FieldType.Variable;
import dev.relism.glossa.content.FieldType;
import dev.relism.glossa.content.FieldTypes;
import dev.relism.glossa.persistence.entities.ContentEvent;
import dev.relism.glossa.persistence.entities.ContentRevision;
import dev.relism.glossa.persistence.entities.ContentVariant;
import dev.relism.glossa.persistence.entities.LocalizedResource;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import dev.relism.glossa.schema.Localization.CreateResource;
import dev.relism.glossa.schema.Localization.Decision;
import dev.relism.glossa.schema.Localization.Detail;
import dev.relism.glossa.schema.Localization.Edit;
import dev.relism.glossa.schema.Localization.EventView;
import dev.relism.glossa.schema.Localization.Rendered;
import dev.relism.glossa.schema.Localization.ResourceView;
import dev.relism.glossa.schema.Localization.Revert;
import dev.relism.glossa.schema.Localization.RevisionView;
import dev.relism.glossa.service.ContentQueries.VariantWithApproved;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * A resource, its per-locale revisions and their review (§5, §7, §8) — the aggregate every other
 * localization service is a satellite of. Roles are checked by {@code @RolesAllowed} on each route;
 * only what depends on the data is decided here.
 */
public final class LocalizationService extends ProjectScoped {

    /** A revision and the locale it was actually found in, which fallbacks may make a different one. */
    record Resolved(ContentRevision revision, String locale) {}

    private static final SpecBuilder.FieldSpec<LocalizedResource, Long> RESOURCE_PROJECT = SpecBuilder.field("projectId");
    private static final SpecBuilder.FieldSpec<ContentVariant, Long> VARIANT_RESOURCE = SpecBuilder.field("resourceId");
    private static final SpecBuilder.FieldSpec<ContentVariant, String> VARIANT_LOCALE = SpecBuilder.field("locale");
    private static final SpecBuilder.FieldSpec<ContentEvent, Long> EVENT_RESOURCE = SpecBuilder.field("resourceId");

    private final ContentQueries queries;

    public LocalizationService(Data data, ContentQueries queries) {
        super(data);
        this.queries = queries;
    }

    /** Three queries however many resources the project holds: its locales, its resources, and both locales' variants with their approved revisions. */
    public List<ResourceView> list(long project, String locale, String prefix) {
        return inProject(project, false, () -> {
            List<ProjectLocale> locales = localesOf(project);
            String origin = source(locales).getLocale();
            enabled(locales, locale);
            Map<String, VariantWithApproved> current = queries.variantsOf(project, Set.copyOf(List.of(origin, locale))).stream()
                    .collect(Collectors.toMap(row -> row.variant().getLocale() + "/" + row.variant().getResourceId(), row -> row));
            return data.repository(LocalizedResource.class)
                    .findAll(Query.<LocalizedResource>all().where(RESOURCE_PROJECT.eq(project)).orderBy(Sort.by("key"))).stream()
                    .filter(resource -> prefix == null || resource.getKey().startsWith(prefix))
                    .map(resource -> {
                        VariantWithApproved origins = current.get(origin + "/" + resource.getId());
                        VariantWithApproved here = current.get(locale + "/" + resource.getId());
                        if (origins == null || origins.approved() == null) throw noSource();
                        return view(resource, origins.approved(),
                                here == null ? null : here.variant(), here == null ? null : here.approved());
                    })
                    .toList();
        });
    }

    /** The resource and its first source revision, approved at once. */
    public ResourceView create(long project, CreateResource request) {
        FieldType type = FieldTypes.named(request.fieldType());
        // §3: leaving the contract out asks the field type to read it off the message itself.
        Map<String, Variable> contract = request.contract() != null ? request.contract() : type.contractOf(request.payload());
        return inProject(project, true, () -> {
            String locale = source(project).getLocale();
            if (queries.keyTaken(project, request.key())) throw HttpException.conflict("That key already exists.");
            type.validate(request.payload(), contract, locale, false);
            LocalizedResource resource = new LocalizedResource();
            resource.setProjectId(project);
            resource.setKey(request.key());
            resource.setContext(request.context());
            resource.setFieldType(type.name());
            data.repository(LocalizedResource.class).save(resource);
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
            ContentRevision revision = revision(decision.revisionId());
            if (revision.isMachine() && machine) throw HttpException.forbidden("A machine proposal needs human review.");
            Long approved = variant.getApprovedRevisionId();
            if (decision.approve()) {
                if (!Objects.equals(revision.getBasedOnSourceRevisionId(), sourceRevision(resource).getId())) {
                    throw HttpException.conflict("The source changed after this proposal.");
                }
                FieldTypes.named(resource.getFieldType()).validate(revision.getPayload(), revision.getContract(), locale, false);
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

    /** The translator context is guidance, not content: it changes in place and has no revisions. */
    public ResourceView context(long project, long id, String context) {
        return inProject(project, true, () -> {
            LocalizedResource resource = resource(project, id);
            resource.setContext(context == null || context.isBlank() ? null : context.strip());
            return view(resource, source(project).getLocale());
        });
    }

    /** The resource with its source and {@code locale} revisions, and the log entries about them. */
    public Detail detail(long project, long id, String locale) {
        return inProject(project, false, () -> {
            enabled(project, locale);
            LocalizedResource resource = resource(project, id);
            List<RevisionView> revisions = queries.revisionsOf(id, Set.copyOf(List.of(locale, source(project).getLocale())));
            Set<Long> shown = revisions.stream().map(RevisionView::id).collect(Collectors.toSet());
            List<EventView> events = data.repository(ContentEvent.class)
                    .findAll(Query.<ContentEvent>all().where(EVENT_RESOURCE.eq(id)).orderBy(Sort.by("id"))).stream()
                    .filter(e -> e.getRevisionId() == null || shown.contains(e.getRevisionId()))
                    .map(e -> new EventView(e.getId(), e.getRevisionId(), e.getBeforeRevisionId(), e.getAfterRevisionId(),
                            e.getAction(), e.getActor(), e.getCreatedAt()))
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
            String text = FieldTypes.named(resource.getFieldType())
                    .render(revision.getPayload(), revision.getContract(), resolved.locale(), values);
            return new Rendered(text, resolved.locale(), revision.getId());
        });
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
                ContentRevision previous = data.repository(ContentRevision.class).findById(revertTo).orElse(null);
                if (previous == null || !previous.getVariantId().equals(variant.getId())) throw HttpException.notFound("Revision");
                payload = previous.getPayload();
                if (origin) contract = previous.getContract();
            } else if (!origin && edit.contract() != null && !edit.contract().equals(contract)) {
                throw HttpException.badRequest("A translation keeps the source's variables.");
            }
            FieldType type = FieldTypes.named(resource.getFieldType());
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
        data.repository(ContentRevision.class).save(revision);
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
        data.repository(ContentEvent.class).save(event);
    }

    /**
     * The first current approved value along {@code locale}'s fallback chain, which {@code configureLocale} keeps
     * acyclic. A stale translation is skipped as a whole message, never mixed with its source. {@code resolved_entry}
     * derives the same answer in SQL for whoever only needs the ids; this one also validates what it found.
     */
    Resolved resolve(LocalizedResource resource, String locale, boolean complete) {
        ContentRevision source = sourceRevision(resource);
        for (String current = locale; current != null; current = enabled(resource.getProjectId(), current).getFallbackLocale()) {
            ContentVariant variant = variant(resource, current, false);
            if (variant == null || variant.getApprovedRevisionId() == null) continue;
            ContentRevision revision = revision(variant.getApprovedRevisionId());
            if (stale(revision, source)) continue;
            FieldTypes.named(resource.getFieldType()).validate(revision.getPayload(), revision.getContract(), current, complete);
            return new Resolved(revision, current);
        }
        throw HttpException.conflict("Nothing approved to show for " + resource.getKey() + ".");
    }

    ResourceView view(LocalizedResource resource, String locale) {
        ContentVariant variant = variant(resource, locale, false);
        return view(resource, sourceRevision(resource), variant,
                variant == null || variant.getApprovedRevisionId() == null ? null : revision(variant.getApprovedRevisionId()));
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
        return revision(variant.getApprovedRevisionId());
    }

    private ContentRevision revision(long id) {
        return data.repository(ContentRevision.class).findById(id).orElseThrow(() -> HttpException.notFound("Revision"));
    }

    private static HttpException noSource() {
        return HttpException.conflict("This resource has no approved source.");
    }

    private ContentVariant variant(LocalizedResource resource, String locale, boolean create) {
        ContentVariant variant = data.repository(ContentVariant.class)
                .findOne(VARIANT_RESOURCE.eq(resource.getId()).and(VARIANT_LOCALE.eq(locale))).orElse(null);
        if (variant == null && create) {
            variant = new ContentVariant();
            variant.setResourceId(resource.getId());
            variant.setProjectId(resource.getProjectId());
            variant.setLocale(locale);
            data.repository(ContentVariant.class).save(variant);
        }
        return variant;
    }

    LocalizedResource resource(long project, long id) {
        LocalizedResource resource = data.repository(LocalizedResource.class).findById(id).orElse(null);
        if (resource == null || resource.getProjectId() != project) throw HttpException.notFound("Resource");
        return resource;
    }

    private LocalizedResource active(long project, long id) {
        LocalizedResource resource = resource(project, id);
        if (resource.isArchived()) throw HttpException.conflict("This resource is archived.");
        return resource;
    }
}
