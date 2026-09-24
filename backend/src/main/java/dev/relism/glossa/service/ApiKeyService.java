package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.apikey.GeneratedApiKey;
import dev.relism.glossa.auth.ApiKeys;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.ProjectApiKey;
import dev.relism.glossa.persistence.entities.Role;
import dev.relism.glossa.schema.Keys.IssuedKey;
import dev.relism.glossa.schema.Keys.KeyRequest;
import dev.relism.glossa.schema.Keys.KeyView;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * §11's API key administration, shared by every transport and open only to a project's managers
 * ({@code @RolesAllowed} on each). Failures are {@link HttpException}s.
 */
@RequiredArgsConstructor
public final class ApiKeyService {

    private static final SpecBuilder.FieldSpec<ProjectApiKey, Long> PROJECT = SpecBuilder.field("projectId");

    private final Data data;
    private final ApiKeys store;

    public List<KeyView> list(long project) {
        return data.repository(ProjectApiKey.class).findAll(PROJECT.eq(project)).stream().sorted(Comparator.comparing(ProjectApiKey::getCreatedAt).reversed()).map(ApiKeyService::keyViewOf).toList();
    }

    public IssuedKey issue(long project, KeyRequest request) {
        return create(project, request, issuer());
    }

    /** A new secret for the same name and grant; the old token stops working at once. */
    public IssuedKey rotate(long project, long id) {
        ProjectApiKey old = owned(project, id);
        Instant now = Instant.now();
        if (old.getRevokedAt() != null || old.getExpiresAt() != null && old.getExpiresAt().isBefore(now)) {
            throw HttpException.conflict("Only an active key can be rotated.");
        }
        long issuer = issuer();
        return data.write(() -> {
            old.setRevokedAt(now);
            data.repository(ProjectApiKey.class).update(old);
            return create(project, new KeyRequest(old.getName(), old.getRole(), old.getLocale(), old.getExpiresAt()), issuer);
        });
    }

    /** A stamp, not a delete: the row is what an audit reads. */
    public void revoke(long project, long id) {
        ProjectApiKey key = owned(project, id);
        if (key.getRevokedAt() != null) return;
        key.setRevokedAt(Instant.now());
        data.repository(ProjectApiKey.class).update(key);
    }

    /** Resolved before any write opens: resolving a user reads, and a read cannot join a write. */
    private static long issuer() {
        return SecurityIdentity.current().user(AppUser.class).getId();
    }

    private IssuedKey create(long project, KeyRequest request, long issuer) {
        GeneratedApiKey generated = store.extension().generate();
        ProjectApiKey row = new ProjectApiKey();
        row.setKeyId(generated.id());
        row.setSecretHash(generated.secretHash());
        row.setProjectId(project);
        row.setRole(request.role());
        row.setLocale(request.locale());
        row.setCreatedBy(issuer);
        row.setName(request.name());
        row.setExpiresAt(request.expiresAt());
        return new IssuedKey(data.repository(ProjectApiKey.class).save(row).getId(), request.name(), request.role(), request.locale(), generated.token());
    }

    private ProjectApiKey owned(long project, long id) {
        return data.repository(ProjectApiKey.class).findById(id).filter(k -> k.getProjectId() == project).orElseThrow(() -> HttpException.notFound("API key"));
    }

    private static KeyView keyViewOf(ProjectApiKey k) {
        return new KeyView(k.getId(), k.getName(), k.getRole(), k.getLocale(), k.getCreatedAt(), k.getExpiresAt(), k.getRevokedAt());
    }
}
