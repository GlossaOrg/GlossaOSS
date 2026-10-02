package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.content.FieldTypes;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import dev.relism.glossa.schema.Localization.CreateResource;
import dev.relism.glossa.schema.Localization.Edit;
import dev.relism.glossa.schema.Localization.Import;
import dev.relism.glossa.schema.Localization.Imported;
import dev.relism.glossa.schema.Localization.ResourceView;
import dev.relism.glossa.schema.Localization.Skipped;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Brings a file's messages in, one ordinary write per entry: into the source, new keys become
 * resources; elsewhere, each becomes the caller's own change (§8), a proposal unless they review.
 * An entry that cannot be written is reported and the rest still go in — which is why this calls
 * the aggregate's own routes rather than writing rows of its own.
 */
public final class ImportService extends ProjectScoped {

    private final LocalizationService content;

    public ImportService(Data data, LocalizationService content) {
        super(data);
        this.content = content;
    }

    public Imported importMessages(long project, String locale, Import request) {
        List<ProjectLocale> locales = inProject(project, false, () -> localesOf(project));
        enabled(locales, locale);
        boolean origin = source(locales).getLocale().equals(locale);
        if (origin && !allows(project, null, "MANAGER")) throw HttpException.forbidden("Only a manager can import into the source.");
        Map<String, ResourceView> known = content.list(project, locale, null).stream()
                .collect(Collectors.toMap(ResourceView::key, r -> r));
        int created = 0, updated = 0, unchanged = 0;
        List<Skipped> skipped = new ArrayList<>();
        for (Map.Entry<String, String> entry : new TreeMap<>(request.entries()).entrySet()) {
            ResourceView current = known.get(entry.getKey());
            Map<String, Object> payload = Map.of("pattern", entry.getValue() == null ? "" : entry.getValue());
            try {
                if (current == null) {
                    if (!origin) {
                        skipped.add(new Skipped(entry.getKey(), "No such key in the source."));
                        continue;
                    }
                    content.create(project, new CreateResource(entry.getKey(), null, FieldTypes.MESSAGE.name(), payload, null));
                    created++;
                } else if (current.archived()) {
                    skipped.add(new Skipped(entry.getKey(), "Archived."));
                } else if (payload.equals(current.payload())) {
                    unchanged++;
                } else if (current.pendingRevisionId() != null) {
                    skipped.add(new Skipped(entry.getKey(), "A proposal is waiting for review."));
                } else {
                    content.edit(project, current.id(), locale,
                            new Edit(Objects.requireNonNullElse(current.headRevisionId(), 0L), current.sourceRevisionId(), payload, null));
                    updated++;
                }
            } catch (HttpException refused) {
                skipped.add(new Skipped(entry.getKey(), refused.getMessage()));
            }
        }
        return new Imported(created, updated, unchanged, skipped);
    }
}
