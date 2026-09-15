package dev.relism.glossa.api;

import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.GlossaApp;
import dev.relism.flash.ext.jackson.Json;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.service.UserService;

import java.util.Map;

/** What the server and the caller are, before any project is involved. */
public abstract class MetaHandlers extends RequestHandler {

    protected Json json;
    protected UserService users;

    @Override
    protected void onInit() {
        json = require(Json.class);
        users = require(UserService.class);
    }

    /** Liveness probe for the container healthcheck (see deploy/docker-compose.yml). */
    @GET("/healthz")
    @ApiOperation(summary = "Service name, version and liveness status.", tags = "meta")
    public static final class Health extends MetaHandlers {
        @Override public Object handle(Request req, Response res) {
            return Map.of("service", "glossa", "version", GlossaApp.VERSION, "status", "ok");
        }
    }

    public record MeView(long id, String email, String name, boolean admin, boolean mustChangePassword) {}

    public record NewPassword(String password) {}

    /** The signed-in user, for the frontend to gate on (§11). Roles are per project (§8) and come with the project. */
    @GET("/api/me")
    @Authenticated
    @ApiOperation(summary = "The signed-in user's identity.", tags = "meta")
    public static final class Me extends MetaHandlers {
        @Override public Object handle(Request req, Response res) {
            AppUser user = SecurityIdentity.current().user(AppUser.class);
            // The resolver rather than the column, so an API key never reads as an administrator.
            return new MeView(user.getId(), user.getEmail(), user.getName(),
                    SecurityIdentity.current().hasRole(ProjectRoles.ADMINISTRATOR), user.getPasswordResetAt() != null);
        }
    }

    /** What an account does about its own password, including after an administrator retired it. */
    @POST("/api/me/password")
    @Authenticated
    @ApiOperation(summary = "Replaces the signed-in account's password.", tags = "meta")
    public static final class ChangePassword extends MetaHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            users.changePassword(json.body(req, NewPassword.class).password());
            res.status(204);
            return null;
        }
    }
}
