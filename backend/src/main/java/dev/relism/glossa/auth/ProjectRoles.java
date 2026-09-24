package dev.relism.glossa.auth;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.RoleResolver;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.Target;
import dev.relism.flash.ext.security.apikey.ApiKeyPrincipal;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.ProjectMember;
import dev.relism.glossa.persistence.entities.Role;
import lombok.RequiredArgsConstructor;

/**
 * §8's roles, held per project and optionally per locale, read from Glossa's own data under every
 * authentication strategy — an identity provider's roles decide nothing. An API key holds exactly
 * its grant.
 *
 * <p>{@link #ADMINISTRATOR} is the exception: the only role that is not a project's. It covers every
 * project and owns what belongs to the installation rather than to one project — users above all.
 */
@RequiredArgsConstructor
public final class ProjectRoles implements RoleResolver {

    private static final SpecBuilder.FieldSpec<ProjectMember, Long> PROJECT = SpecBuilder.field("projectId");
    private static final SpecBuilder.FieldSpec<ProjectMember, Long> USER = SpecBuilder.field("userId");

    private final Data data;

    /** The one role that is not a project's: it holds across the whole installation (§11). */
    public static final String ADMINISTRATOR = "ADMINISTRATOR";

    @Override
    public boolean hasRole(SecurityIdentity identity, String role, Target on) {
        if (ADMINISTRATOR.equals(role)) {
            // Never an API key: a key is issued for one project and cannot reach past it (§11).
            return identity.principal(ApiKeyPrincipal.class) == null && identity.user(AppUser.class).isAdmin();
        }
        Role required = Role.valueOf(role);
        String locale = on.get("locale");
        long project;
        try {
            project = Long.parseLong(on.get("project"));
        } catch (NumberFormatException noProject) {
            return false;
        }
        ApiKeyPrincipal<?> key = identity.principal(ApiKeyPrincipal.class);
        if (key != null && key.grant() instanceof ApiKeys.Grant grant) {
            return grant.project() == project && grant.role().covers(required) && allows(grant.locale(), locale);
        }
        AppUser user = identity.user(AppUser.class);
        if (user.isAdmin()) return true;
        // ponytail: one indexed query per check; memoize in the installed cache if a profile shows it.
        return data.repository(ProjectMember.class).findAll(PROJECT.eq(project).and(USER.eq(user.getId())))
                .stream().anyMatch(member -> member.getRole().covers(required) && allows(member.getLocale(), locale));
    }

    /** A grant without a locale covers every locale. */
    private static boolean allows(String granted, String requested) {
        return granted == null || granted.equals(requested);
    }
}
