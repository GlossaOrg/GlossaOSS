package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.hibernate.HibernateRepository;
import dev.relism.glossa.persistence.entities.ContentRevision;
import dev.relism.glossa.persistence.entities.ContentVariant;
import dev.relism.glossa.schema.Localization.RevisionView;
import jakarta.persistence.TypedQuery;
import org.hibernate.query.NativeQuery;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Every localization query a {@code Spec} cannot express — joins, the derived-state views of
 * {@code V13}, the counts and the locale purge — and the only class in {@code service/} that sees
 * HQL or SQL. Rows arrive as records: the {@code Object[]} casts a projection costs stop here.
 *
 * <p>Typed on {@link ContentVariant} because that is the aggregate's hinge; the queries reach the
 * resources, revisions and releases around it. Public only so {@code GlossaApp} can build the one
 * instance the localization services share — a handler has no business here.
 */
public final class ContentQueries extends HibernateRepository<ContentVariant, Long> {

    /** A locale's copy of a resource and the revision it serves, which is null until one is approved. */
    record VariantWithApproved(ContentVariant variant, ContentRevision approved) {}

    /** How many resources of one locale sit in one state, as {@code variant_state} derives it. */
    record StateCount(String locale, String state, long count) {}

    /** What a locale actually serves for a resource, fallbacks already followed by {@code resolved_entry}. */
    record ResolvedEntry(String key, String resolvedLocale, long revisionId) {}

    public ContentQueries(Data data) {
        super(data.tx(), ContentVariant.class);
    }

    /** Every variant of these locales with its approved revision: two locales' state in one query, whatever the resource count. */
    List<VariantWithApproved> variantsOf(long project, Collection<String> locales) {
        return hql("""
                select v, r from ContentVariant v
                left join ContentRevision r on r.id = v.approvedRevisionId
                where v.projectId = :project and v.locale in (:locales)
                """, Object[].class, q -> q.setParameter("project", project).setParameter("locales", locales))
                .stream().map(row -> new VariantWithApproved((ContentVariant) row[0], (ContentRevision) row[1])).toList();
    }

    /** A resource's revisions in these locales, oldest first, each already carrying the locale it belongs to. */
    List<RevisionView> revisionsOf(long resource, Collection<String> locales) {
        return hql("""
                select r, v.locale from ContentRevision r
                join ContentVariant v on v.id = r.variantId
                where v.resourceId = :resource and v.locale in (:locales)
                order by r.id
                """, Object[].class, q -> q.setParameter("resource", resource).setParameter("locales", locales))
                .stream().map(row -> {
                    ContentRevision r = (ContentRevision) row[0];
                    return new RevisionView(r.getId(), (String) row[1], r.getBasedOnSourceRevisionId(), r.getPayload(),
                            r.getContract(), r.getActor(), r.isMachine(), r.getCreatedAt());
                }).toList();
    }

    /**
     * §7/§8's states counted by the view, one row per locale and state. Native, so it is read in a
     * read-only transaction only: a native query does not flush Hibernate's pending writes first.
     */
    List<StateCount> stateCounts(long project) {
        return rows("select locale, state, count(*) from variant_state where project_id = :project group by locale, state",
                q -> q.setParameter("project", project))
                .stream().map(row -> new StateCount((String) row[0], (String) row[1], ((Number) row[2]).longValue())).toList();
    }

    /** What publishing this locale right now would serve, by the same rule delivery resolves with. Native: see {@link #stateCounts}. */
    List<ResolvedEntry> resolvedEntries(long project, String locale) {
        return rows("select key, resolved_locale, revision_id from resolved_entry where project_id = :project and locale = :locale",
                q -> q.setParameter("project", project).setParameter("locale", locale))
                .stream().map(row -> new ResolvedEntry((String) row[0], (String) row[1], ((Number) row[2]).longValue())).toList();
    }

    long liveResources(long project) {
        return single("select count(*) from LocalizedResource where projectId = :project and archived = false",
                q -> q.setParameter("project", project));
    }

    boolean keyTaken(long project, String key) {
        return single("select count(*) from LocalizedResource where projectId = :project and key = :key",
                q -> q.setParameter("project", project).setParameter("key", key)) > 0;
    }

    /** A release's version counts its own locale's releases, not every locale's. */
    long releaseVersion(long project, String locale, long release) {
        return single("select count(*) from CatalogRelease where projectId = :project and locale = :locale and id <= :id",
                q -> q.setParameter("project", project).setParameter("locale", locale).setParameter("id", release));
    }

    Optional<String> artifact(long project, String locale, String hash) {
        return hql("select artifact from CatalogRelease where projectId = :project and locale = :locale and hash = :hash",
                String.class, q -> q.setParameter("project", project).setParameter("locale", locale)
                        .setParameter("hash", hash).setMaxResults(1)).stream().findFirst();
    }

    /**
     * A translation locale and everything written in it, gone. V7's immutability triggers let the
     * deletes through for this transaction alone; there are no cascades, and variants and revisions
     * point at each other, so the order is the whole correctness of this method.
     */
    void purgeLocale(long project, String locale) {
        String variants = "select v.id from ContentVariant v where v.projectId = :project and v.locale = :locale";
        String revisions = "select r.id from ContentRevision r where r.variantId in (" + variants + ")";
        rwQuery(() -> {
            session().createNativeQuery("select set_config('glossa.removing_locale', 'on', true)", String.class).getSingleResult();
            return null;
        });
        mutate("delete from ContentEvent where revisionId in (" + revisions + ") or beforeRevisionId in (" + revisions
                + ") or afterRevisionId in (" + revisions + ")", project, locale);
        mutate("update ContentVariant set headRevisionId = null, approvedRevisionId = null, pendingRevisionId = null"
                + " where projectId = :project and locale = :locale", project, locale);
        mutate("delete from ContentRevision where variantId in (" + variants + ")", project, locale);
        mutate("delete from ContentVariant where projectId = :project and locale = :locale", project, locale);
        mutate("delete from CatalogRelease where projectId = :project and locale = :locale", project, locale);
        mutate("update ProjectLocale set fallbackLocale = null where projectId = :project and fallbackLocale = :locale", project, locale);
        mutate("delete from GlossaryTerm where projectId = :project and locale = :locale", project, locale);
        mutate("delete from ProjectLocale where projectId = :project and locale = :locale", project, locale);
    }

    private void mutate(String query, long project, String locale) {
        hqlMutate(query, q -> q.setParameter("project", project).setParameter("locale", locale));
    }

    private long single(String counting, Consumer<TypedQuery<Long>> params) {
        return hql(counting, Long.class, params).stream().findFirst().orElse(0L);
    }

    private List<Object[]> rows(String sql, Consumer<NativeQuery<Object[]>> params) {
        return roQuery(() -> {
            NativeQuery<Object[]> query = session().createNativeQuery(sql, Object[].class);
            params.accept(query);
            return query.getResultList();
        });
    }
}
