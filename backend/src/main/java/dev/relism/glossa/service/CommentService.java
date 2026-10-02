package dev.relism.glossa.service;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.Query;
import dev.relism.flash.ext.data.core.Sort;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.ResourceComment;
import dev.relism.glossa.schema.Localization.CommentView;
import dev.relism.glossa.schema.Localization.NewComment;

import java.util.List;

/** The thread about one resource in one locale (§8). It carries no revisions and reviews nothing. */
public final class CommentService extends ProjectScoped {

    private static final SpecBuilder.FieldSpec<ResourceComment, Long> RESOURCE = SpecBuilder.field("resourceId");
    private static final SpecBuilder.FieldSpec<ResourceComment, String> LOCALE = SpecBuilder.field("locale");

    private final LocalizationService content;

    public CommentService(Data data, LocalizationService content) {
        super(data);
        this.content = content;
    }

    /** Oldest first. */
    public List<CommentView> comments(long project, long id, String locale) {
        return inProject(project, false, () -> {
            enabled(project, locale);
            content.resource(project, id);
            return data.repository(ResourceComment.class)
                    .findAll(Query.<ResourceComment>all().where(RESOURCE.eq(id).and(LOCALE.eq(locale))).orderBy(Sort.by("id")))
                    .stream().map(CommentService::view).toList();
        });
    }

    public CommentView comment(long project, long id, String locale, NewComment request) {
        if (request.body().isBlank()) throw HttpException.badRequest("Write something first.");
        return inProject(project, true, () -> {
            enabled(project, locale);
            content.resource(project, id);
            ResourceComment comment = new ResourceComment();
            comment.setProjectId(project);
            comment.setResourceId(id);
            comment.setLocale(locale);
            // A name to show, not an audit trail: an OIDC subject means nothing to the reader. An API key signs as itself.
            comment.setAuthor(machine() ? actor() : SecurityIdentity.current().user(AppUser.class).getName());
            comment.setBody(request.body().strip());
            data.repository(ResourceComment.class).save(comment);
            return view(comment);
        });
    }

    private static CommentView view(ResourceComment c) {
        return new CommentView(c.getId(), c.getLocale(), c.getAuthor(), c.getBody(), c.getCreatedAt());
    }
}
