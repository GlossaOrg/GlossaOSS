package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import lombok.RequiredArgsConstructor;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.schema.Projects.NewProject;
import dev.relism.glossa.schema.Projects.ProjectView;
import dev.relism.glossa.service.ProjectService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;

/** {@code /api/projects} over {@link ProjectService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ProjectHandlers {

    @GET("/api/projects")
    @Authenticated
    @ApiOperation(summary = "The caller's projects.", description = "With their role on each.", tags = "Projects")
    @RequiredArgsConstructor
    public static final class GetAll extends JsonHandler<Void, List<ProjectView>> {
        private final ProjectService projects;
        @Override public List<ProjectView> handle(Request req, Response res, Void ignored) {
            return projects.list();
        }
    }

    @POST("/api/projects")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Creates a project.", tags = "Projects")
    @APIResponse(responseCode = "201", description = "Created, with the caller as its manager")
    @APIResponse(responseCode = "409", description = "That name is already taken")
    @RequiredArgsConstructor
    public static final class Create extends JsonHandler<NewProject, ProjectView> {
        private final ProjectService projects;
        @Override public ProjectView handle(Request req, Response res, NewProject body) throws Exception {
            res.status(201);
            return projects.create(body);
        }
    }
}
