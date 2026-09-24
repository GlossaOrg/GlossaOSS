package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.schema.Ai.SettingsUpdate;
import dev.relism.glossa.schema.Ai.SettingsView;
import dev.relism.glossa.service.AiService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.Map;

/** §9: whether AI features work, which everybody may read, and the provider behind them, which only an administrator may. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class AiHandlers {

    /** Every route here works through AiService; one that also reads a body extends {@link Body}. */
    private abstract static class Base extends RequestHandler { @Inject protected AiService ai; }
    private abstract static class Body<B> extends JsonHandler<B> { @Inject protected AiService ai; }

    /** Not an administrator's: a translator has to know whether to expect AI, and nothing here is private. */
    @GET("/api/ai")
    @Authenticated
    @ApiOperation(summary = "Whether an AI call is allowed.", tags = "Meta")
    public static final class Available extends Base {
        @Override public Object handle(Request req, Response res) {
            return Map.of("available", ai.available());
        }
    }

    @GET("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "The AI provider in use.",
                  description = "Whether the features are on, and what is behind them. Never the API key.",
                  tags = "Meta")
    public static final class Get extends Base {
        @Override public SettingsView handle(Request req, Response res) {
            return ai.settings();
        }
    }

    @PUT("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Sets the AI provider.", description = "An absent key keeps the stored one.", tags = "Meta")
    public static final class Configure extends Body<SettingsUpdate> {
        @Override public SettingsView handle(Request req, Response res, SettingsUpdate body) throws Exception {
            return ai.configure(body);
        }
    }
}
