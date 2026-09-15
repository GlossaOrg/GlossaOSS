package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.PermitAll;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.service.UserService;

/** {@code /api/invite/{token}}: the invited person's own two calls, open to anyone — the token is the credential. */
public abstract class InviteHandlers extends RequestHandler {

    public record Chosen(String name, String password) {}

    protected Json json;
    protected UserService users;

    @Override
    protected void onInit() {
        json = require(Json.class);
        users = require(UserService.class);
    }

    @GET("/api/invite/{token}")
    @PermitAll
    @ApiOperation(summary = "What the invitation is for, so its page can address the right person.", tags = "users")
    public static final class Get extends InviteHandlers {
        @Override public Object handle(Request req, Response res) {
            return users.peek(req.param("token"));
        }
    }

    @POST("/api/invite/{token}")
    @PermitAll
    @ApiOperation(summary = "Takes the invitation up with a password of the invitee's choosing.", tags = "users")
    public static final class Accept extends InviteHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            Chosen chosen = json.body(req, Chosen.class);
            res.status(201);
            return users.accept(req.param("token"), chosen.password(), chosen.name());
        }
    }
}
