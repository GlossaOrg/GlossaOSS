package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.PermitAll;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.service.SetupService;

/** {@code /api/setup} over {@link SetupService}: open to anyone, because until the first account exists nobody can sign in. */
public abstract class SetupHandlers extends RequestHandler {

    protected Json json;
    protected SetupService setup;

    @Override
    protected void onInit() {
        json = require(Json.class);
        setup = require(SetupService.class);
    }

    @GET("/api/setup")
    @PermitAll
    @ApiOperation(summary = "Whether the install still waits for its first user.", tags = "meta")
    public static final class Get extends SetupHandlers {
        @Override public Object handle(Request req, Response res) {
            return setup.state();
        }
    }

    @POST("/api/setup")
    @PermitAll
    @ApiOperation(summary = "Creates the first account, which administers the install. Refused once anyone exists.", tags = "meta")
    public static final class Create extends SetupHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            setup.createFirstAccount(json.body(req, SetupService.FirstAccount.class));
            res.status(201);
            return null;
        }
    }
}
