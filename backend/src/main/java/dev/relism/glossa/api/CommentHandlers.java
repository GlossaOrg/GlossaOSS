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
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.CommentService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** {@code /api/projects/{project}/resources/{resource}/comments} over {@link CommentService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class CommentHandlers {

    @GET("/api/projects/{project}/resources/{resource}/comments")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The thread about a resource in one locale.", tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, required = true, description = "Whose thread.")
    @RequiredArgsConstructor
    public static final class Comments extends JsonHandler<Void, List<Localization.CommentView>> {
        private final CommentService comments;
        @Override public List<Localization.CommentView> handle(Request req, Response res, Void ignored) {
            return comments.comments(LocalizationHandlers.project(req), LocalizationHandlers.resource(req), req.query("locale"));
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/comments")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Adds to the thread about a resource in one locale.", tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, required = true, description = "Whose thread.")
    @APIResponse(responseCode = "201", description = "Added")
    @RequiredArgsConstructor
    public static final class Comment extends JsonHandler<Localization.NewComment, Localization.CommentView> {
        private final CommentService comments;
        @Override public Localization.CommentView handle(Request req, Response res, Localization.NewComment body) {
            res.status(201);
            return comments.comment(LocalizationHandlers.project(req), LocalizationHandlers.resource(req), req.query("locale"), body);
        }
    }
}
