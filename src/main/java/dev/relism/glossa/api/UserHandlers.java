package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.service.UserService;

/** {@code /api/users} over {@link UserService}. Accounts are the installation's, so only an administrator manages them. */
public abstract class UserHandlers extends RequestHandler {

    protected Json json;
    protected UserService users;

    @Override
    protected void onInit() {
        json = require(Json.class);
        users = require(UserService.class);
    }

    static long id(Request req) {
        return Long.parseLong(req.param("id"));
    }

    static int days(Request req) {
        return req.query("days") == null ? 7 : Integer.parseInt(req.query("days"));
    }

    @GET("/api/users")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Every account and open invitation, with how each signs in and what it may do.", tags = "users")
    public static final class GetAll extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            return users.list();
        }
    }

    @POST("/api/users/invites")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Invites an email. A password invitation answers with its one-time link, returned once.", tags = "users")
    public static final class Invite extends UserHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            res.status(201);
            return users.invite(json.body(req, UserService.InviteRequest.class));
        }
    }

    @DELETE("/api/users/invites/{id}")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Withdraws an invitation that has not been taken up.", tags = "users")
    public static final class CancelInvite extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            users.cancelInvite(id(req));
            res.status(204);
            return null;
        }
    }

    @POST("/api/users/{id}/password-reset")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "A fresh one-time link for a password account, returned once.", tags = "users")
    public static final class ResetPassword extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            res.status(201);
            return users.resetPassword(id(req), days(req));
        }
    }

    @POST("/api/users/{id}/disable")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Suspends an account: it keeps everything, and nothing it holds signs in.", tags = "users")
    public static final class Disable extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            users.disable(id(req), true);
            res.status(204);
            return null;
        }
    }

    @POST("/api/users/{id}/enable")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Lets a suspended account back in.", tags = "users")
    public static final class Enable extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            users.disable(id(req), false);
            res.status(204);
            return null;
        }
    }

    @DELETE("/api/users/{id}")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Removes an account's access and project roles. The row stays, so §8's change log can still name it.", tags = "users")
    public static final class Delete extends UserHandlers {
        @Override public Object handle(Request req, Response res) {
            users.delete(id(req));
            res.status(204);
            return null;
        }
    }
}
