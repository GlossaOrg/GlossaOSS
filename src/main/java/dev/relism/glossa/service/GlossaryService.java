package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.persistence.entities.GlossaryTerm;
import dev.relism.glossa.persistence.entities.ProjectLocale;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/** §6's glossary: what a term is to become in a locale, or that it is to be left alone. */
public final class GlossaryService {

    /** A null {@code locale} is every locale; a null {@code translation} means leave the term as it is. */
    public record TermView(long id, String term, String locale, String translation) {}

    public record NewTerm(String term, String locale, String translation) {}

    private static final SpecBuilder.FieldSpec<GlossaryTerm, Long> TERM_PROJECT = SpecBuilder.field("projectId");
    private static final SpecBuilder.FieldSpec<ProjectLocale, Long> LOCALE_PROJECT = SpecBuilder.field("projectId");

    private final Data data;

    public GlossaryService(Data data) {
        this.data = data;
    }

    /** Every term, or the ones that apply to one locale: its own plus those that apply to all. */
    public List<TermView> list(long project, String locale) {
        return terms(project, locale).stream()
                .map(row -> new TermView(row.getId(), row.getTerm(), row.getLocale(), row.getTranslation()))
                .toList();
    }

    /** Adds a term or replaces what that term already says for that locale. */
    public TermView save(long project, NewTerm request) {
        String term = request.term() == null ? "" : request.term().trim();
        if (term.isEmpty() || term.length() > 255) throw HttpException.badRequest("Use up to 255 characters for the term.");
        String locale = locale(project, request.locale());
        String translation = request.translation() == null || request.translation().isBlank() ? null : request.translation().trim();
        GlossaryTerm row = data.repository(GlossaryTerm.class).findAll(TERM_PROJECT.eq(project)).stream()
                .filter(existing -> existing.getTerm().equalsIgnoreCase(term) && Objects.equals(existing.getLocale(), locale))
                .findFirst().orElseGet(GlossaryTerm::new);
        boolean adding = row.getId() == null;
        row.setProjectId(project);
        row.setTerm(term);
        row.setLocale(locale);
        row.setTranslation(translation);
        data.write(() -> adding ? data.repository(GlossaryTerm.class).save(row) : data.repository(GlossaryTerm.class).update(row));
        return new TermView(row.getId(), row.getTerm(), row.getLocale(), row.getTranslation());
    }

    public void remove(long project, long id) {
        data.repository(GlossaryTerm.class).findById(id)
                .filter(row -> row.getProjectId().equals(project))
                .orElseThrow(() -> HttpException.notFound("Term"));
        data.write(() -> data.repository(GlossaryTerm.class).deleteById(id));
    }

    /** The terms as §9's prompt takes them, or {@code None.} where the project keeps no glossary. */
    String forPrompt(long project, String locale) {
        List<GlossaryTerm> terms = terms(project, locale);
        if (terms.isEmpty()) return "None.";
        return terms.stream()
                .map(row -> row.getTranslation() == null
                        ? "- \"" + row.getTerm() + "\" must be kept exactly as it is, untranslated."
                        : "- \"" + row.getTerm() + "\" must be translated as \"" + row.getTranslation() + "\".")
                .collect(Collectors.joining("\n"));
    }

    /** ponytail: read whole and filtered in memory, which a project's glossary is small enough for. */
    private List<GlossaryTerm> terms(long project, String locale) {
        return data.repository(GlossaryTerm.class).findAll(TERM_PROJECT.eq(project)).stream()
                .filter(row -> locale == null || row.getLocale() == null || row.getLocale().equals(locale))
                .sorted(Comparator.comparing(GlossaryTerm::getTerm, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /** A term may name a locale the project has enabled, or none at all, so a term never outlives its locale. */
    private String locale(long project, String tag) {
        if (tag == null || tag.isBlank()) return null;
        String locale = MessageType.locale(tag);
        boolean enabled = data.repository(ProjectLocale.class).findAll(LOCALE_PROJECT.eq(project)).stream()
                .anyMatch(row -> row.getLocale().equals(locale));
        if (!enabled) throw HttpException.badRequest(locale + " isn't enabled on this project.");
        return locale;
    }
}
