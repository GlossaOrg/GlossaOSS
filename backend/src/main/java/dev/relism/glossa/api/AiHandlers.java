package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import lombok.RequiredArgsConstructor;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
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

    /** Not an administrator's: a translator has to know whether to expect AI, and nothing here is private. */
    @GET("/api/ai")
    @Authenticated
    @ApiOperation(summary = "Whether an AI call is allowed.", tags = "Meta")
    @RequiredArgsConstructor
    public static final class Available extends JsonHandler<Void, Object> {
        private final AiService ai;
        @Override public Object handle(Request req, Response res, Void ignored) {
            return Map.of("available", ai.available());
        }
    }

    @GET("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "The AI provider in use.",
                  description = "Whether the features are on, and what is behind them. Never the API key.",
                  tags = "Meta")
    @RequiredArgsConstructor
    public static final class Get extends JsonHandler<Void, SettingsView> {
        private final AiService ai;
        @Override public SettingsView handle(Request req, Response res, Void ignored) {
            return ai.settings();
        }
    }

    @PUT("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Sets the AI provider.", description = "An absent key keeps the stored one.", tags = "Meta")
    @RequiredArgsConstructor
    public static final class Configure extends JsonHandler<SettingsUpdate, SettingsView> {
        private final AiService ai;
        @Override public SettingsView handle(Request req, Response res, SettingsUpdate body) throws Exception {
            return ai.configure(body);
        }
    }
}
