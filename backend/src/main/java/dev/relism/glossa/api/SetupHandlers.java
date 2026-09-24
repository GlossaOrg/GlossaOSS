package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.security.PermitAll;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
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

    /** Every route here works through SetupService; one that also reads a body extends {@link Body}. */
    private abstract static class Base extends RequestHandler { @Inject protected SetupService setup; }
    private abstract static class Body<B> extends JsonHandler<B> { @Inject protected SetupService setup; }

    @GET("/api/setup")
    @PermitAll
    @ApiOperation(summary = "Whether a first user is needed.", tags = "Meta")
    public static final class Get extends Base {
        @Override public SetupView handle(Request req, Response res) {
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
    public static final class Create extends Body<FirstAccount> {
        @Override public Object handle(Request req, Response res, FirstAccount body) throws Exception {
            setup.createFirstAccount(body);
            res.status(201);
            return null;
        }
    }
}
