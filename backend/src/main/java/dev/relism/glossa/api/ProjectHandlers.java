package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.auth.ProjectRoles;
import dev.relism.glossa.schema.Projects.NewProject;
import dev.relism.glossa.schema.Projects.ProjectView;
import dev.relism.glossa.schema.Projects.WebhookUpdate;
import dev.relism.glossa.schema.Projects.WebhookView;
import dev.relism.glossa.service.ProjectService;
import dev.relism.glossa.service.WebhookService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;

/** {@code /api/projects} over {@link ProjectService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ProjectHandlers {

    /** Every route here works through ProjectService, and names what it reads and what it answers. */
    private abstract static class Base<I, O> extends JsonHandler<I, O> { @Inject protected ProjectService projects; }

    @GET("/api/projects")
    @Authenticated
    @ApiOperation(summary = "The caller's projects.", description = "With their role on each.", tags = "Projects")
    public static final class GetAll extends Base<Void, List<ProjectView>> {
        @Override public List<ProjectView> handle(Request req, Response res, Void ignored) {
            return projects.list();
        }
    }

    @POST("/api/projects")
    @RolesAllowed(ProjectRoles.ADMINISTRATOR)
    @ApiOperation(summary = "Creates a project.", tags = "Projects")
    @APIResponse(responseCode = "201", description = "Created, with the caller as its manager")
    @APIResponse(responseCode = "409", description = "That name is already taken")
    public static final class Create extends Base<NewProject, ProjectView> {
        @Override public ProjectView handle(Request req, Response res, NewProject body) throws Exception {
            res.status(201);
            return projects.create(body);
        }
    }

    @GET("/api/projects/{project}/webhook")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Where the project announces a new release.", tags = "Projects")
    public static final class Webhook extends JsonHandler<Void, WebhookView> {
        @Inject private WebhookService webhooks;
        @Override public WebhookView handle(Request req, Response res, Void ignored) {
            return webhooks.view(Long.parseLong(req.param("project")));
        }
    }

    @PUT("/api/projects/{project}/webhook")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Sets or removes the webhook.",
                  description = "Each new release is POSTed to it as JSON, signed as sha256=HMAC(secret, body) in X-Glossa-Signature. The secret is answered only here.",
                  tags = "Projects")
    public static final class ConfigureWebhook extends JsonHandler<WebhookUpdate, WebhookView> {
        @Inject private WebhookService webhooks;
        @Override public WebhookView handle(Request req, Response res, WebhookUpdate body) {
            return webhooks.configure(Long.parseLong(req.param("project")), body.url());
        }
    }
}
