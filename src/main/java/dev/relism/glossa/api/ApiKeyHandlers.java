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
import dev.relism.glossa.service.ApiKeyService;

/** {@code /api/projects/{project}/keys} over {@link ApiKeyService}. */
public abstract class ApiKeyHandlers extends RequestHandler {

    protected Json json;
    protected ApiKeyService keys;

    @Override
    protected void onInit() {
        json = require(Json.class);
        keys = require(ApiKeyService.class);
    }

    static long project(Request req) {
        return Long.parseLong(req.param("project"));
    }

    @GET("/api/projects/{project}/keys")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "The API keys issued for a project, without their secrets.", tags = "keys")
    public static final class GetAll extends ApiKeyHandlers {
        @Override public Object handle(Request req, Response res) {
            return keys.list(project(req));
        }
    }

    @POST("/api/projects/{project}/keys")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Issues an API key for a project. The token is returned once.", tags = "keys")
    public static final class Create extends ApiKeyHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            ApiKeyService.IssuedKey issued = keys.issue(project(req), json.body(req, ApiKeyService.KeyRequest.class));
            res.status(201);
            return issued;
        }
    }

    @POST("/api/projects/{project}/keys/{id}/rotate")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Replaces an active key's secret and revokes the old one. The new token is returned once.", tags = "keys")
    public static final class Rotate extends ApiKeyHandlers {
        @Override public Object handle(Request req, Response res) {
            return keys.rotate(project(req), Long.parseLong(req.param("id")));
        }
    }

    @DELETE("/api/projects/{project}/keys/{id}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Revokes an API key.", tags = "keys")
    public static final class Revoke extends ApiKeyHandlers {
        @Override public Object handle(Request req, Response res) {
            keys.revoke(project(req), Long.parseLong(req.param("id")));
            res.status(204);
            return null;
        }
    }
}
