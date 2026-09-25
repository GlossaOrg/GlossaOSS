package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Undocumented;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.GlossaApp;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.schema.Users.MeView;
import dev.relism.glossa.schema.Users.NewPassword;
import dev.relism.glossa.service.UserService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.Map;

/** What the server and the caller are, before any project is involved. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class MetaHandlers {

    /** Liveness probe for the container healthcheck (see deploy/docker-compose.yml). */
    @GET("/healthz")
    @ApiOperation(summary = "Name, version and liveness.", tags = "Meta")
        @Undocumented
    public static final class Health extends JsonHandler<Void, Map<String, String>> {
        @Override public Map<String, String> handle(Request req, Response res, Void ignored) {
            return Map.of("service", "glossa", "version", GlossaApp.VERSION, "status", "ok");
        }
    }

    /** The signed-in user, for the frontend to gate on (§11). Roles are per project (§8) and come with the project. */
    @GET("/api/me")
    @Authenticated
    @ApiOperation(summary = "The signed-in user's identity.", tags = "Meta")
    public static final class Me extends JsonHandler<Void, MeView> {
        @Override public MeView handle(Request req, Response res, Void ignored) {
            AppUser user = SecurityIdentity.current().user(AppUser.class);
            // The resolver rather than the column, so an API key never reads as an administrator.
            return new MeView(user.getId(), user.getEmail(), user.getName(),
                    SecurityIdentity.current().hasRole(ProjectRoles.ADMINISTRATOR), user.getPasswordResetAt() != null);
        }
    }

    /** What an account does about its own password, including after an administrator retired it. */
    @POST("/api/me/password")
    @Authenticated
    @ApiOperation(summary = "Changes the account's password.", tags = "Meta")
    @APIResponse(responseCode = "204", description = "Changed. The old one stops working")
    public static final class ChangePassword extends JsonHandler<NewPassword, Void> {
        @Inject private UserService users;

        @Override public Void handle(Request req, Response res, NewPassword body) throws Exception {
            users.changePassword(body.password());
            res.status(204);
            return null;
        }
    }
}
