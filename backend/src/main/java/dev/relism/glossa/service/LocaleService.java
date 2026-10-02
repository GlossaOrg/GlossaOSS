package dev.relism.glossa.service;

import com.ibm.icu.util.ULocale;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import dev.relism.glossa.schema.Localization.LocaleConfig;
import dev.relism.glossa.schema.Localization.LocaleView;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Which locales a project has, what each falls back to, and removing one with everything written in it (§5, §6). */
public final class LocaleService extends ProjectScoped {

    private final ContentQueries queries;

    public LocaleService(Data data, ContentQueries queries) {
        super(data);
        this.queries = queries;
    }

    public List<LocaleView> locales(long project) {
        return inProject(project, false, () -> localesOf(project).stream().map(LocaleService::view).toList());
    }

    public LocaleView configureLocale(long project, String localeCode, LocaleConfig request) {
        String locale = MessageType.locale(localeCode);
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
            if (row.getId() == null) data.repository(ProjectLocale.class).save(row);
            return view(row);
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
            queries.purgeLocale(project, locale);
            return null;
        });
    }

    private static LocaleView view(ProjectLocale l) {
        return new LocaleView(l.getLocale(), l.isSource(), l.getFallbackLocale(), ULocale.forLanguageTag(l.getLocale()).isRightToLeft(),
                MessageType.forms(l.getLocale(), false), MessageType.forms(l.getLocale(), true));
    }
}
