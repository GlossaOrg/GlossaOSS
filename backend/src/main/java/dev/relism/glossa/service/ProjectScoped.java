package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.data.core.Tx;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.apikey.ApiKeyPrincipal;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectLocale;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.hibernate.Session;

import java.util.Comparator;
import java.util.List;

/**
 * A service whose every operation runs inside one project: the transaction, the project lock, the
 * project's locales and the role check, shared by the localization services rather than repeated in
 * each. Subclasses add the domain; nothing here knows a resource from a release.
 */
@RequiredArgsConstructor
abstract class ProjectScoped {

    private static final SpecBuilder.FieldSpec<ProjectLocale, Long> LOCALE_PROJECT = SpecBuilder.field("projectId");

    protected final Data data;

    /** Runs {@code work} on an existing project, locked for a write so that one project's writes serialize. */
    protected final <T> T inProject(long project, boolean write, Tx.TxCallable<T> work) {
        Tx.TxCallable<T> body = () -> {
            // ponytail: one lock per project; lock the resource row instead if concurrent edits contend.
            if (session().find(Project.class, project, write ? LockModeType.PESSIMISTIC_WRITE : LockModeType.NONE) == null) {
                throw HttpException.notFound("Project");
            }
            return work.call();
        };
        return write ? data.write(body) : data.read(body);
    }

    /** The one place in {@code service/} that holds a {@link Session}: {@code Repository} has no lock mode. */
    private Session session() {
        return data.tx().resource(Session.class);
    }

    protected final List<ProjectLocale> localesOf(long project) {
        return data.repository(ProjectLocale.class).findAll(LOCALE_PROJECT.eq(project)).stream()
                .sorted(Comparator.comparing(ProjectLocale::getLocale)).toList();
    }

    protected final ProjectLocale source(long project) {
        return source(localesOf(project));
    }

    protected static ProjectLocale source(List<ProjectLocale> locales) {
        return locales.stream().filter(ProjectLocale::isSource).findFirst()
                .orElseThrow(() -> HttpException.conflict("Add a source locale first."));
    }

    /** Every locale path or argument must match an enabled locale exactly, so the role check and the data agree on it. */
    protected final ProjectLocale enabled(long project, String locale) {
        return enabled(localesOf(project), locale);
    }

    protected static ProjectLocale enabled(List<ProjectLocale> locales, String locale) {
        return locales.stream().filter(l -> l.getLocale().equals(locale)).findFirst()
                .orElseThrow(() -> HttpException.badRequest(locale + " isn't enabled on this project."));
    }

    protected static boolean allows(long project, String locale, String role) {
        return ProjectRoles.held(project, locale, role);
    }

    protected static String actor() {
        return SecurityIdentity.current().principal().name();
    }

    protected static boolean machine() {
        return SecurityIdentity.current().principal(ApiKeyPrincipal.class) != null;
    }
}
