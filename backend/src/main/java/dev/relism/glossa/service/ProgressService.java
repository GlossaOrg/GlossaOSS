package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Query;
import dev.relism.flash.ext.data.core.Sort;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.persistence.entities.CatalogRelease;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import dev.relism.glossa.schema.Localization.Progress;
import dev.relism.glossa.schema.Localization.ReleaseView;
import dev.relism.glossa.service.ContentQueries.StateCount;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Where every locale the caller may read stands: its resources counted by state and its newest
 * release. The states come from {@code variant_state}, so this counts rows the database already
 * classified instead of re-deriving each one.
 */
public final class ProgressService extends ProjectScoped {

    private static final SpecBuilder.FieldSpec<CatalogRelease, Long> RELEASE_PROJECT = SpecBuilder.field("projectId");

    private final ContentQueries queries;
    private final CatalogService catalogs;

    public ProgressService(Data data, ContentQueries queries, CatalogService catalogs) {
        super(data);
        this.queries = queries;
        this.catalogs = catalogs;
    }

    public List<Progress> progress(long project) {
        return inProject(project, false, () -> {
            List<ProjectLocale> mine = localesOf(project).stream()
                    .filter(locale -> allows(project, locale.getLocale(), "READER")).toList();
            if (mine.isEmpty()) throw HttpException.forbidden("No locale of this project is yours to read.");
            int total = (int) queries.liveResources(project);
            Map<String, Map<String, Long>> counted = queries.stateCounts(project).stream()
                    .collect(Collectors.groupingBy(StateCount::locale, Collectors.toMap(StateCount::state, StateCount::count)));
            Map<String, CatalogRelease> newest = new HashMap<>();
            Map<String, Long> published = new HashMap<>();
            data.repository(CatalogRelease.class)
                    .findAll(Query.<CatalogRelease>all().where(RELEASE_PROJECT.eq(project)).orderBy(Sort.desc("id")))
                    .forEach(release -> {
                        newest.putIfAbsent(release.getLocale(), release);
                        published.merge(release.getLocale(), 1L, Long::sum);
                    });
            return mine.stream().map(locale -> {
                Map<String, Long> states = counted.getOrDefault(locale.getLocale(), Map.of());
                CatalogRelease release = newest.get(locale.getLocale());
                return new Progress(locale.getLocale(), total,
                        counted(states, "UNTRANSLATED"), counted(states, "REVIEW"), counted(states, "REJECTED"),
                        counted(states, "OUTDATED"), counted(states, "APPROVED"),
                        catalogs.current(release, project, locale.getLocale()),
                        release == null ? null : new ReleaseView(published.get(locale.getLocale()), release.getLocale(),
                                release.getHash(), release.getCreatedAt()));
            }).toList();
        });
    }

    private static int counted(Map<String, Long> states, String state) {
        return states.getOrDefault(state, 0L).intValue();
    }
}
