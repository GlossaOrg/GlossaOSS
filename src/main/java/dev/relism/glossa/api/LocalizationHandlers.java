package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.limiter.Limit;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.ContentType;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.service.LocalizationService;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/** {@code /api/projects/{project}} localization routes over {@link LocalizationService}. */
public abstract class LocalizationHandlers extends RequestHandler {

    protected Json json;
    protected LocalizationService content;

    @Override
    protected void onInit() {
        json = require(Json.class);
        content = require(LocalizationService.class);
    }

    static long project(Request req) {
        return Long.parseLong(req.param("project"));
    }

    static long resource(Request req) {
        return Long.parseLong(req.param("resource"));
    }

    @GET("/api/projects/{project}/locales")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's locales and the plural categories each needs. A caller whose role is one locale's passes it as locale.", tags = "localization")
    public static final class Locales extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            return content.locales(project(req));
        }
    }

    public record LocaleConfig(boolean source, String fallbackLocale) {}

    @PUT("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Enables a locale or changes its fallback.", tags = "localization")
    public static final class ConfigureLocale extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            LocaleConfig body = json.body(req, LocaleConfig.class);
            return content.configureLocale(project(req), new LocalizationService.LocaleRequest(req.param("locale"), body.source(), body.fallbackLocale()));
        }
    }

    @DELETE("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Removes a translation locale with every revision, release and log entry written in it.", tags = "localization")
    public static final class RemoveLocale extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            content.removeLocale(project(req), req.param("locale"));
            res.status(204);
            return null;
        }
    }

    @GET("/api/projects/{project}/resources")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's resources with their state in one locale.", tags = "localization")
    public static final class Resources extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            return content.list(project(req), req.query("locale"), req.query("prefix"));
        }
    }

    @POST("/api/projects/{project}/resources")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Creates a resource with its approved source value.", tags = "localization")
    public static final class CreateResource extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            res.status(201);
            return content.create(project(req), json.body(req, LocalizationService.CreateResource.class));
        }
    }

    @GET("/api/projects/{project}/resources/{resource}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "One resource: its source and requested-locale revisions, and its change log.", tags = "localization")
    public static final class Detail extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            return content.detail(project(req), resource(req), req.query("locale"));
        }
    }

    @PUT("/api/projects/{project}/resources/{resource}/variants/{locale}")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Writes a revision: approved for a reviewer, a proposal otherwise.", tags = "localization")
    public static final class Edit extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.edit(project(req), resource(req), req.param("locale"), json.body(req, LocalizationService.Edit.class));
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/review")
    @RolesAllowed(value = "REVIEWER", on = {"project", "locale"})
    @ApiOperation(summary = "Approves or rejects the pending proposal.", tags = "localization")
    public static final class Review extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.review(project(req), resource(req), req.param("locale"), json.body(req, LocalizationService.Decision.class));
        }
    }

    @POST("/api/projects/{project}/resources/{resource}/variants/{locale}/revert")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Writes an earlier value as a new revision.", tags = "localization")
    public static final class Revert extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.revert(project(req), resource(req), req.param("locale"), json.body(req, LocalizationService.Revert.class));
        }
    }

    public record Archived(boolean archived) {}

    @PUT("/api/projects/{project}/resources/{resource}/archive")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Archives or restores a resource.", tags = "localization")
    public static final class Archive extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.archive(project(req), resource(req), json.body(req, Archived.class).archived());
        }
    }

    public record Values(Map<String, Object> values) {}

    @POST("/api/projects/{project}/resources/{resource}/render/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders the resource's approved value, following the locale's fallbacks.", tags = "localization")
    public static final class Render extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.render(project(req), resource(req), req.param("locale"), json.body(req, Values.class).values());
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/analyze")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Checks a message and reports its variables and plural branches.", tags = "localization")
    public static final class Analyze extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.analyze(project(req), req.param("locale"), json.body(req, LocalizationService.MessageRequest.class));
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/preview")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders an unsaved message with the values given.", tags = "localization")
    public static final class Preview extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return Map.of("text", content.preview(project(req), req.param("locale"), json.body(req, LocalizationService.MessageRequest.class)));
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/translate")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Suggests a translation for one message (§9). Stores nothing: the caller writes what they keep.", tags = "localization")
    public static final class Translate extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return content.suggest(project(req), req.param("locale"), json.body(req, LocalizationService.Suggest.class));
        }
    }

    @POST("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Publishes the locale's catalog. An unchanged catalog stays the current release.", tags = "delivery")
    public static final class Publish extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            res.status(201);
            return content.publish(project(req), req.param("locale"));
        }
    }

    @GET("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The current release's hash, which addresses the catalog itself.", tags = "delivery")
    public static final class Manifest extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
            res.header("Cache-Control", "private, no-cache");
            return content.manifest(project(req), req.param("locale"));
        }
    }

    /** A catalog never changes under its hash, so it is cached for a year and revalidated by ETag (§10). */
    @GET("/api/projects/{project}/catalogs/{locale}/{hash}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The published catalog with that hash.", tags = "delivery")
    public static final class Catalog extends LocalizationHandlers {
        @Override public Object handle(Request req, Response res) {
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
