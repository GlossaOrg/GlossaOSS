package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.security.PermitAll;
import lombok.RequiredArgsConstructor;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.schema.Setup.FirstAccount;
import dev.relism.glossa.schema.Setup.SetupView;
import dev.relism.glossa.service.SetupService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** {@code /api/setup} over {@link SetupService}: open to anyone, because until the first account exists nobody can sign in. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class SetupHandlers {

    @GET("/api/setup")
    @PermitAll
    @ApiOperation(summary = "Whether a first user is needed.", tags = "Meta")
    @RequiredArgsConstructor
    public static final class Get extends JsonHandler<Void, SetupView> {
        private final SetupService setup;
        @Override public SetupView handle(Request req, Response res, Void ignored) {
            return setup.state();
        }
    }

    @POST("/api/setup")
    @PermitAll
    @ApiOperation(summary = "Creates the first account.",
                  description = "It administers the install, and is refused once anyone exists.",
                  tags = "Meta")
    @APIResponse(responseCode = "201", description = "Created, and it administers the install")
    @APIResponse(responseCode = "409", description = "Somebody already exists, so this route is closed for good")
    @RequiredArgsConstructor
    public static final class Create extends JsonHandler<FirstAccount, Object> {
        private final SetupService setup;
        @Override public Object handle(Request req, Response res, FirstAccount body) throws Exception {
            setup.createFirstAccount(body);
            res.status(201);
            return null;
        }
    }
}
