package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.schema.Keys.IssuedKey;
import dev.relism.glossa.schema.Keys.KeyRequest;
import dev.relism.glossa.schema.Keys.KeyView;
import dev.relism.glossa.service.ApiKeyService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;

/** {@code /api/projects/{project}/keys} over {@link ApiKeyService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ApiKeyHandlers {

    /** Every route here works through ApiKeyService, and names what it reads and what it answers. */
    private abstract static class Base<I, O> extends JsonHandler<I, O> { @Inject protected ApiKeyService keys; }

    static long project(Request req) {
        return Long.parseLong(req.param("project"));
    }

    @GET("/api/projects/{project}/keys")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "The project's API keys.", description = "Never their secrets.", tags = "Keys")
    public static final class GetAll extends Base<Void, List<KeyView>> {
        @Override public List<KeyView> handle(Request req, Response res, Void ignored) {
            return keys.list(project(req));
        }
    }

    @POST("/api/projects/{project}/keys")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Issues an API key.", description = "The token is returned once.", tags = "Keys")
    @APIResponse(responseCode = "201", description = "Issued. The token is in this answer and nowhere else")
    public static final class Create extends Base<KeyRequest, Object> {
        @Override public Object handle(Request req, Response res, KeyRequest body) throws Exception {
            IssuedKey issued = keys.issue(project(req), body);
            res.status(201);
            return issued;
        }
    }

    @POST("/api/projects/{project}/keys/{id}/rotate")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Rotates a key's secret.",
                  description = "The old secret is revoked, and the new token is returned once.",
                  tags = "Keys")
    @APIResponse(responseCode = "404", description = "No such key in this project")
    public static final class Rotate extends Base<Void, IssuedKey> {
        @Override public IssuedKey handle(Request req, Response res, Void ignored) {
            return keys.rotate(project(req), Long.parseLong(req.param("id")));
        }
    }

    @DELETE("/api/projects/{project}/keys/{id}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Revokes an API key.", tags = "Keys")
    @APIResponse(responseCode = "204", description = "Revoked, and the token stops working at once")
    @APIResponse(responseCode = "404", description = "No such key in this project")
    public static final class Revoke extends Base<Void, Object> {
        @Override public Object handle(Request req, Response res, Void ignored) {
            keys.revoke(project(req), Long.parseLong(req.param("id")));
            res.status(204);
            return null;
        }
    }
}
