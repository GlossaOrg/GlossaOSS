package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.limiter.Limit;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.openapi.Parameter;
import dev.relism.flash.ext.openapi.ParameterIn;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.http.ContentType;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.schema.Localization.Archived;
import dev.relism.glossa.schema.Localization.Decision;
import dev.relism.glossa.schema.Localization.LocaleConfig;
import dev.relism.glossa.schema.Localization.LocaleRequest;
import dev.relism.glossa.schema.Localization.MessageRequest;
import dev.relism.glossa.schema.Localization.Suggest;
import dev.relism.glossa.schema.Localization.Values;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.LocalizationService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** {@code /api/projects/{project}} localization routes over {@link LocalizationService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class LocalizationHandlers {

    /** Every route here works through LocalizationService, and names what it reads and what it answers. */
    private abstract static class Base<I, O> extends JsonHandler<I, O> { @Inject protected LocalizationService content; }

    static long project(Request req) {
        return Long.parseLong(req.param("project"));
    }

    static long resource(Request req) {
        return Long.parseLong(req.param("resource"));
    }

    @GET("/api/projects/{project}/locales")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's locales.",
                  description = "With the plural categories each needs. A caller whose role is one locale's passes it as locale.",
                  tags = "Localization")
    public static final class Locales extends Base<Void, List<Localization.LocaleView>> {
        @Override public List<Localization.LocaleView> handle(Request req, Response res, Void ignored) {
            return content.locales(project(req));
        }
    }

    @PUT("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Enables a locale or changes its fallback.", tags = "Localization")
    public static final class ConfigureLocale extends Base<LocaleConfig, Localization.LocaleView> {
        @Override public Localization.LocaleView handle(Request req, Response res, LocaleConfig body) throws Exception {
            return content.configureLocale(project(req), new LocaleRequest(req.param("locale"), body.source(), body.fallbackLocale()));
        }
    }

    @DELETE("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Removes a translation locale.",
                  description = "With every revision, release and log entry written in it.",
                  tags = "Localization")
    @APIResponse(responseCode = "204", description = "Removed with everything written in it")
    @APIResponse(responseCode = "409", description = "The source locale cannot be removed")
    public static final class RemoveLocale extends Base<Void, Object> {
        @Override public Object handle(Request req, Response res, Void ignored) {
            content.removeLocale(project(req), req.param("locale"));
            res.status(204);
            return null;
        }
    }

    @GET("/api/projects/{project}/resources")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's resources.",
                  description = "With their state in one locale.",
                  tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, description = "Which locale's state to report. The caller's own when their role is one locale's.")
    @Parameter(name = "prefix", in = ParameterIn.QUERY, description = "Only the keys under this dotted prefix.")
    public static final class Resources extends Base<Void, List<Localization.ResourceView>> {
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
    public static final class CreateResource extends Base<Localization.CreateResource, Localization.ResourceView> {
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
    public static final class Detail extends Base<Void, Localization.Detail> {
        @Override public Localization.Detail handle(Request req, Response res, Void ignored) {
            return content.detail(project(req), resource(req), req.query("locale"));
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/variants/{locale}")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Writes a revision.",
                  description = "Approved for a reviewer, a proposal otherwise.",
                  tags = "Localization")
    public static final class Edit extends Base<Localization.Edit, Localization.ResourceView> {
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.Edit body) throws Exception {
            return content.edit(project(req), resource(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/review")
    @RolesAllowed(value = "REVIEWER", on = {"project", "locale"})
    @ApiOperation(summary = "Approves or rejects the pending proposal.", tags = "Localization")
    @APIResponse(responseCode = "409", description = "That proposal is not the one pending")
    public static final class Review extends Base<Decision, Localization.ResourceView> {
        @Override public Localization.ResourceView handle(Request req, Response res, Decision body) throws Exception {
            return content.review(project(req), resource(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/revert")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Reverts to an earlier revision.",
                  description = "The earlier value is written as a new one.",
                  tags = "Localization")
    public static final class Revert extends Base<Localization.Revert, Localization.ResourceView> {
        @Override public Localization.ResourceView handle(Request req, Response res, Localization.Revert body) throws Exception {
            return content.revert(project(req), resource(req), req.param("locale"), body);
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/archive")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Archives or restores a resource.", tags = "Localization")
    public static final class Archive extends Base<Archived, Localization.ResourceView> {
        @Override public Localization.ResourceView handle(Request req, Response res, Archived body) throws Exception {
            return content.archive(project(req), resource(req), body.archived());
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/render/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders the approved value.",
                  description = "Following the locale's fallbacks.",
                  tags = "Localization")
    public static final class Render extends Base<Values, Localization.Rendered> {
        @Override public Localization.Rendered handle(Request req, Response res, Values body) throws Exception {
            return content.render(project(req), resource(req), req.param("locale"), body.values());
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/analyze")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Checks a message.",
                  description = "Reports its variables and plural branches.",
                  tags = "Localization")
    public static final class Analyze extends Base<MessageRequest, MessageType.Analysis> {
        @Override public MessageType.Analysis handle(Request req, Response res, MessageRequest body) throws Exception {
            return content.analyze(project(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/preview")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders an unsaved message with the values given.", tags = "Localization")
    public static final class Preview extends Base<MessageRequest, Object> {
        @Override public Object handle(Request req, Response res, MessageRequest body) throws Exception {
            return Map.of("text", content.preview(project(req), req.param("locale"), body));
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/translate")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Suggests a translation.",
                  description = "§9. Stores nothing: the caller writes what they keep.",
                  tags = "Localization")
    public static final class Translate extends Base<Suggest, Map<String, Object>> {
        @Override public Map<String, Object> handle(Request req, Response res, Suggest body) throws Exception {
            return content.suggest(project(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Publishes the locale's catalog.",
                  description = "An unchanged catalog stays the current release.",
                  tags = "Delivery")
    @APIResponse(responseCode = "201", description = "Published. An unchanged catalog stays the release it already was")
    public static final class Publish extends Base<Void, Localization.ReleaseView> {
        @Override public Localization.ReleaseView handle(Request req, Response res, Void ignored) {
            res.status(201);
            return content.publish(project(req), req.param("locale"));
        }
    }

    @GET("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The current release's hash.",
                  description = "It addresses the catalog itself.",
                  tags = "Delivery")
    public static final class Manifest extends Base<Void, Localization.ReleaseView> {
        @Override public Localization.ReleaseView handle(Request req, Response res, Void ignored) {
            res.header("Cache-Control", "private, no-cache");
            return content.manifest(project(req), req.param("locale"));
        }
    }

    /** A catalog never changes under its hash, so it is cached for a year and revalidated by ETag (§10). */
    @GET("/api/projects/{project}/catalogs/{locale}/{hash}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The published catalog with that hash.", tags = "Delivery")
    @APIResponse(responseCode = "304", description = "Unchanged, as the ETag said")
    @APIResponse(responseCode = "404", description = "No catalog with that hash")
    public static final class Catalog extends Base<Void, Object> {
        @Override public Object handle(Request req, Response res, Void ignored) {
            String etag = "\"" + req.param("hash") + "\"";
            String artifact = content.catalog(project(req), req.param("locale"), req.param("hash"));
            res.header("ETag", etag).header("Cache-Control", "private, max-age=31536000, immutable");
            if (etag.equals(req.header("If-None-Match"))) {
                res.status(304);
                return null;
            }
            res.type(ContentType.JSON);
            return artifact;
        }
    }
}
