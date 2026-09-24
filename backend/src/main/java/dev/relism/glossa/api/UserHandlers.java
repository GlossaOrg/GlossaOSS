package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.schema.Users.AccountView;
import dev.relism.glossa.schema.Users.InviteRequest;
import dev.relism.glossa.schema.Users.Invited;
import dev.relism.glossa.service.UserService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;

/** {@code /api/users} over {@link UserService}. Accounts are the installation's, so only an administrator manages them. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UserHandlers {

    /** Every route here works through UserService; one that also reads a body extends {@link Body}. */
    private abstract static class Base extends RequestHandler { @Inject protected UserService users; }
    private abstract static class Body<B> extends JsonHandler<B> { @Inject protected UserService users; }

    static long id(Request req) {
        return Long.parseLong(req.param("id"));
    }

    static int days(Request req) {
        return req.query("days") == null ? 7 : Integer.parseInt(req.query("days"));
    }

    @GET("/api/users")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Every account and open invitation.",
                  description = "With how each signs in and what it may do.",
                  tags = "Users")
    public static final class GetAll extends Base {
        @Override public List<AccountView> handle(Request req, Response res) {
            return users.list();
        }
    }

    @POST("/api/users/invites")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Invites an email address.",
                  description = "A password invitation answers with its one-time link, returned once.",
                  tags = "Users")
    @APIResponse(responseCode = "201", description = "Invited. The link is in this answer and nowhere else")
    @APIResponse(responseCode = "409", description = "That address already has an account here")
    public static final class Invite extends Body<InviteRequest> {
        @Override public Invited handle(Request req, Response res, InviteRequest body) throws Exception {
            res.status(201);
            return users.invite(body);
        }
    }

    @DELETE("/api/users/invites/{id}")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Withdraws an invitation.", description = "One that has not been taken up.", tags = "Users")
    public static final class CancelInvite extends Base {
        @Override public Object handle(Request req, Response res) {
            users.cancelInvite(id(req));
            res.status(204);
            return null;
        }
    }

    @POST("/api/users/{id}/password-reset")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "A fresh one-time link.",
                  description = "For a password account, returned once.",
                  tags = "Users")
    @APIResponse(responseCode = "201", description = "A new link, and the current password stops working")
    @APIResponse(responseCode = "404", description = "No such account")
    public static final class ResetPassword extends Base {
        @Override public Invited handle(Request req, Response res) {
            res.status(201);
            return users.resetPassword(id(req), days(req));
        }
    }

    @POST("/api/users/{id}/disable")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Suspends an account.",
                  description = "It keeps everything, and nothing it holds signs in.",
                  tags = "Users")
    @APIResponse(responseCode = "204", description = "Suspended: every request of theirs is refused until it is undone")
    @APIResponse(responseCode = "404", description = "No such account")
    public static final class Disable extends Base {
        @Override public Object handle(Request req, Response res) {
            users.disable(id(req), true);
            res.status(204);
            return null;
        }
    }

    @POST("/api/users/{id}/enable")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Lets a suspended account back in.", tags = "Users")
    @APIResponse(responseCode = "204", description = "Back in use")
    @APIResponse(responseCode = "404", description = "No such account")
    public static final class Enable extends Base {
        @Override public Object handle(Request req, Response res) {
            users.disable(id(req), false);
            res.status(204);
            return null;
        }
    }

    @DELETE("/api/users/{id}")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Removes an account's access.",
                  description = "Its project roles go too. The row stays, so §8's change log can still name it.",
                  tags = "Users")
    @APIResponse(responseCode = "204", description = "Removed. The row stays for what it wrote (§8)")
    @APIResponse(responseCode = "404", description = "No such account")
    public static final class Delete extends Base {
        @Override public Object handle(Request req, Response res) {
            users.delete(id(req));
            res.status(204);
            return null;
        }
    }
}
