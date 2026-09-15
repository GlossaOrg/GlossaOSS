package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.apikey.ApiKeyPrincipal;
import dev.relism.glossa.auth.ApiKeys;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectMember;
import dev.relism.glossa.persistence.entities.Role;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;

/** The projects the caller can see (§5), each with the highest role the caller holds on it (§8). */
public final class ProjectService {

    public record ProjectView(long id, String slug, String name, Role role) {}

    public record NewProject(String slug, String name) {}

    private static final SpecBuilder.FieldSpec<Project, Long> ID = SpecBuilder.field("id");
    private static final SpecBuilder.FieldSpec<ProjectMember, Long> USER = SpecBuilder.field("userId");

    private final Data data;

    public ProjectService(Data data) {
        this.data = data;
    }

    /** The slug is derived from the name when not given. */
    public ProjectView create(NewProject request) {
        String name = request.name() == null ? "" : request.name().trim();
        String given = request.slug() == null || request.slug().isBlank() ? name : request.slug();
        String slug = given.trim().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (name.isEmpty()) throw HttpException.badRequest("Name is required.");
        if (slug.isEmpty()) throw HttpException.badRequest("Name needs a letter or a digit.");
        Project project = new Project();
        project.setSlug(slug);
        project.setName(name);
        try {
            Project saved = data.write(() -> data.repository(Project.class).save(project));
            return new ProjectView(saved.getId(), saved.getSlug(), saved.getName(), Role.MANAGER);
        } catch (RuntimeException taken) {
            throw HttpException.conflict("A project with that name already exists.");
        }
    }

    public List<ProjectView> list() {
        SecurityIdentity caller = SecurityIdentity.current();
        AppUser user = caller.user(AppUser.class);
        Map<Long, Role> roles;
        if (caller.principal(ApiKeyPrincipal.class) instanceof ApiKeyPrincipal<?> key && key.grant() instanceof ApiKeys.Grant grant) {
            roles = Map.of(grant.project(), grant.role());
        } else if (!user.isAdmin()) {
            roles = data.repository(ProjectMember.class).findAll(USER.eq(user.getId())).stream()
                    .collect(Collectors.toMap(ProjectMember::getProjectId, ProjectMember::getRole, BinaryOperator.maxBy(Comparator.naturalOrder())));
            if (roles.isEmpty()) return List.of();
        } else {
            roles = null;
        }
        return (roles == null ? data.repository(Project.class).findAll() : data.repository(Project.class).findAll(ID.in(roles.keySet()))).stream()
                .map(p -> new ProjectView(p.getId(), p.getSlug(), p.getName(), roles == null ? Role.MANAGER : roles.get(p.getId())))
                .sorted(Comparator.comparing(ProjectView::name)).toList();
    }

}
