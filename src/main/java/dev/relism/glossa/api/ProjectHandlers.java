package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.service.ProjectService;

/** {@code /api/projects} over {@link ProjectService}. */
public abstract class ProjectHandlers extends RequestHandler {

    protected Json json;
    protected ProjectService projects;

    @Override
    protected void onInit() {
        json = require(Json.class);
        projects = require(ProjectService.class);
    }

    @GET("/api/projects")
    @Authenticated
    @ApiOperation(summary = "The projects the caller belongs to, with the caller's role on each.", tags = "projects")
    public static final class GetAll extends ProjectHandlers {
        @Override public Object handle(Request req, Response res) {
            return projects.list();
        }
    }

    @POST("/api/projects")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Creates a project.", tags = "projects")
    public static final class Create extends ProjectHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            res.status(201);
            return projects.create(json.body(req, ProjectService.NewProject.class));
        }
    }
}
