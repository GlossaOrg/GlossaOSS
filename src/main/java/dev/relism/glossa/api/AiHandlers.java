package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.service.AiService;

import java.util.Map;

/** §9: whether AI features work, which everybody may read, and the provider behind them, which only an administrator may. */
public abstract class AiHandlers extends RequestHandler {

    protected Json json;
    protected AiService ai;

    @Override
    protected void onInit() {
        json = require(Json.class);
        ai = require(AiService.class);
    }

    /** Not an administrator's: a translator has to know whether to expect AI, and nothing here is private. */
    @GET("/api/ai")
    @Authenticated
    @ApiOperation(summary = "Whether an AI call would be allowed right now.", tags = "meta")
    public static final class Available extends AiHandlers {
        @Override public Object handle(Request req, Response res) {
            return Map.of("available", ai.available());
        }
    }

    @GET("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Whether AI features are on, and the provider behind them. Never the API key.", tags = "meta")
    public static final class Get extends AiHandlers {
        @Override public Object handle(Request req, Response res) {
            return ai.settings();
        }
    }

    @PUT("/api/ai/provider")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Turns AI features on or off and sets the provider. An absent key keeps the stored one.", tags = "meta")
    public static final class Configure extends AiHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return ai.configure(json.body(req, AiService.SettingsUpdate.class));
        }
    }
}
