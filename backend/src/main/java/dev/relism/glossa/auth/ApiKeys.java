package dev.relism.glossa.auth;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.apikey.ApiKey;
import dev.relism.flash.ext.security.apikey.ApiKeyExtension;
import dev.relism.flash.ext.security.apikey.ApiKeyStore;
import dev.relism.glossa.persistence.entities.ProjectApiKey;
import dev.relism.glossa.persistence.entities.Role;
import lombok.RequiredArgsConstructor;

/** §11's API keys as rows, verified by {@link ApiKeyExtension}; issued by {@code ApiKeyService}. */
@RequiredArgsConstructor
public final class ApiKeys implements ApiKeyStore<ApiKeys.Grant> {

    /** What a key may do — its own grant, never its issuer's roles; {@code issuedBy} is who its writes are attributed to (§8). */
    public record Grant(long project, Role role, String locale, long issuedBy) {}

    private static final SpecBuilder.FieldSpec<ProjectApiKey, String> KEY_ID = SpecBuilder.field("keyId");

    private final Data data;
    private final ApiKeyExtension<Grant> extension = new ApiKeyExtension<>("gk", this);

    public ApiKeyExtension<Grant> extension() {
        return extension;
    }

    @Override
    public ApiKey<Grant> find(String keyId) {
        ProjectApiKey row = data.repository(ProjectApiKey.class).findOne(KEY_ID.eq(keyId)).orElse(null);
        return row == null ? null : new ApiKey<>(keyId, row.getSecretHash(),
                new Grant(row.getProjectId(), row.getRole(), row.getLocale(), row.getCreatedBy()), row.getExpiresAt(), row.getRevokedAt());
    }
}
