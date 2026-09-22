package dev.relism.glossa;

import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.security.UserResolver;
import dev.relism.flash.extension.FlashContext;
import dev.relism.flash.extension.FlashExtension;
import dev.relism.flash.extension.FlashRegistrar;
import dev.relism.glossa.auth.ApiKeys;
import dev.relism.glossa.auth.Users;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.service.AiService;
import dev.relism.glossa.service.ApiKeyService;
import dev.relism.glossa.service.GlossaryService;
import dev.relism.glossa.service.LocalizationService;
import dev.relism.glossa.service.ProjectService;
import dev.relism.glossa.service.SetupService;
import dev.relism.glossa.service.UserService;

/**
 * Glossa's application-service graph, in one place rather than spread through {@link GlossaApp}:
 * every handler in a scanned package is instantiated at boot and resolves its dependencies then,
 * whether or not a caller ever exercises it, so all of this has to exist before the scan either
 * way. Each {@code XxxService} is a constructor-injected POJO with no framework dependency.
 *
 * <p>{@link #users()} and {@link #keys()} are the two that are also an extension's collaborator,
 * not only a handler's, so they are readable here instead of being fetched back out of the
 * context — {@link GlossaApp} needs them while it is still building the install chain.
 */
public final class GlossaServices implements FlashExtension {

    private final Data data;
    private final boolean localLogin;
    private final boolean selfAdministered;
    private final UserService accounts;
    private final Users users;
    private final ApiKeys keys;
    private final AiService.Access ai;

    /**
     * @param others resolves the principals of mechanisms installed beside Glossa's own
     * @param ai     where AI calls may go, or null to use this installation's own settings (§9)
     */
    public GlossaServices(Data data, boolean localLogin, boolean selfAdministered, UserResolver<AppUser> others, AiService.Access ai) {
        this.data = data;
        this.localLogin = localLogin;
        this.selfAdministered = selfAdministered;
        this.accounts = new UserService(data);
        this.users = new Users(data, selfAdministered, accounts, others);
        this.keys = new ApiKeys(data);
        this.ai = ai;
    }

    public Users users() {
        return users;
    }

    public ApiKeys keys() {
        return keys;
    }

    @Override
    public void configure(FlashRegistrar<?> app, FlashContext ctx) {
        ctx.provide(UserService.class, accounts);
        ctx.provide(ApiKeyService.class, new ApiKeyService(data, keys));
        ctx.provide(ProjectService.class, new ProjectService(data));
        ctx.provide(SetupService.class, new SetupService(data, localLogin, selfAdministered));
        ctx.provide(GlossaryService.class, new GlossaryService(data));
        ctx.supply(AiService.class, Json.class, json -> new AiService(data, json.mapper(), ai));
        ctx.supply(LocalizationService.class, c -> new LocalizationService(data, c.require(Json.class).mapper(),
                c.require(AiService.class), c.require(GlossaryService.class)), Json.class, AiService.class, GlossaryService.class);
    }
}
