package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.PermitAll;
import lombok.RequiredArgsConstructor;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.schema.Users.Accepted;
import dev.relism.glossa.schema.Users.Chosen;
import dev.relism.glossa.schema.Users.InviteView;
import dev.relism.glossa.service.UserService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** {@code /api/invite/{token}}: the invited person's own two calls, open to anyone — the token is the credential. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class InviteHandlers {

    @GET("/api/invite/{token}")
    @PermitAll
    @ApiOperation(summary = "What the invitation is for.",
                  description = "So its page can address the right person.",
                  tags = "Users")
    @APIResponse(responseCode = "404", description = "No such invitation, or it has expired or been taken up")
    @RequiredArgsConstructor
    public static final class Get extends JsonHandler<Void, InviteView> {
        private final UserService users;
        @Override public InviteView handle(Request req, Response res, Void ignored) {
            return users.peek(req.param("token"));
        }
    }

    @POST("/api/invite/{token}")
    @PermitAll
    @ApiOperation(summary = "Takes the invitation up.",
                  description = "With a password of the invitee's choosing.",
                  tags = "Users")
    @APIResponse(responseCode = "201", description = "The account is theirs, and the answer says who they turned out to be")
    @APIResponse(responseCode = "404", description = "No such invitation, or it has expired or been taken up")
    @RequiredArgsConstructor
    public static final class Accept extends JsonHandler<Chosen, Accepted> {
        private final UserService users;
        @Override public Accepted handle(Request req, Response res, Chosen body) throws Exception {
            Chosen chosen = body;
            res.status(201);
            return users.accept(req.param("token"), chosen.password(), chosen.name());
        }
    }
}
