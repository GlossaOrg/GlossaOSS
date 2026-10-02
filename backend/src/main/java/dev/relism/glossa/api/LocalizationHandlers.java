package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Parameter;
import dev.relism.flash.ext.openapi.ParameterIn;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.schema.Localization.Archived;
import dev.relism.glossa.schema.Localization.Decision;
import dev.relism.glossa.schema.Localization.Values;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.LocalizationService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;

import java.util.List;

/**
 * {@code /api/projects/{project}/resources} over {@link LocalizationService}: the resources
 * themselves, their per-locale revisions and their review. The locales, comments, imports,
 * messages, catalogs and progress each have their own file.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class LocalizationHandlers {

    static long project(Request req) {
        return Long.parseLong(req.param("project"));
    }

    static long resource(Request req) {
        return Long.parseLong(req.param("resource"));
    }

    @GET("/api/projects/{project}/resources")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's resources.",
                  description = "With their state in one locale.",
                  tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, description = "Which locale's state to report. The caller's own when their role is one locale's.")
    @Parameter(name = "prefix", in = ParameterIn.QUERY, description = "Only the keys under this dotted prefix.")
    @RequiredArgsConstructor
    public static final class Resources extends JsonHandler<Void, List<Localization.ResourceView>> {
        private final LocalizationService content;
        @Override public List<Localization.ResourceView> handle(Request req, Response res, Void ignored) {
            return content.list(project(req), req.query("locale"), req.query("prefix"));
        }
    }

    @POST("/api/projects/{project}/resources")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Creates a resource.",
                  description = "With its approved source value.",
                  tags = "Localization")
    @APIResponse(responseCode = "201", description = "Created, with its first source revision approved")
    @APIResponse(responseCode = "409", description = "That key is already taken in this project")
    @RequiredArgsConstructor
    public static final class CreateResource extends JsonHandler<Localization.CreateResource, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.CreateResource body) throws Exception {
            res.status(201);
            return content.create(project(req), body);
        }
    }

    @GET("/api/projects/{project}/resources/{resource}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "One resource in full.",
                  description = "Its source and requested-locale revisions, and its change log.",
                  tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, description = "Which locale's revisions to include beside the source's.")
    @APIResponse(responseCode = "404", description = "No such resource in this project")
    @RequiredArgsConstructor
    public static final class Detail extends JsonHandler<Void, Localization.Detail> {
        private final LocalizationService content;
        @Override public Localization.Detail handle(Request req, Response res, Void ignored) {
            return content.detail(project(req), resource(req), req.query("locale"));
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/context")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Changes what translators are told about a resource.", tags = "Localization")
    @RequiredArgsConstructor
    public static final class Context extends JsonHandler<Localization.Context, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.Context body) {
            return content.context(project(req), resource(req), body.context());
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/variants/{locale}")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Writes a revision.",
                  description = "Approved for a reviewer, a proposal otherwise.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Edit extends JsonHandler<Localization.Edit, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.Edit body) throws Exception {
            return content.edit(project(req), resource(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/review")
    @RolesAllowed(value = "REVIEWER", on = {"project", "locale"})
    @ApiOperation(summary = "Approves or rejects the pending proposal.", tags = "Localization")
    @APIResponse(responseCode = "409", description = "That proposal is not the one pending")
    @RequiredArgsConstructor
    public static final class Review extends JsonHandler<Decision, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Decision body) throws Exception {
            return content.review(project(req), resource(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/revert")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Reverts to an earlier revision.",
                  description = "The earlier value is written as a new one.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Revert extends JsonHandler<Localization.Revert, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.Revert body) throws Exception {
            return content.revert(project(req), resource(req), req.param("locale"), body);
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/archive")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Archives or restores a resource.", tags = "Localization")
    @RequiredArgsConstructor
    public static final class Archive extends JsonHandler<Archived, Localization.ResourceView> {
        private final LocalizationService content;
        @Override public Localization.ResourceView handle(Request req, Response res, Archived body) throws Exception {
            return content.archive(project(req), resource(req), body.archived());
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/render/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders the approved value.",
                  description = "Following the locale's fallbacks.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Render extends JsonHandler<Values, Localization.Rendered> {
        private final LocalizationService content;
        @Override public Localization.Rendered handle(Request req, Response res, Values body) throws Exception {
            return content.render(project(req), resource(req), req.param("locale"), body.values());
        }
    }
}
