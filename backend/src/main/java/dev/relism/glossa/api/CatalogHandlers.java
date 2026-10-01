package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.limiter.Limit;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.ContentType;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.CatalogService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import java.util.concurrent.TimeUnit;

/** §10's delivery routes, {@code /api/projects/{project}/catalogs}, over {@link CatalogService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class CatalogHandlers {

    @POST("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Publishes the locale's catalog.",
                  description = "An unchanged catalog stays the current release.",
                  tags = "Delivery")
    @APIResponse(responseCode = "201", description = "Published. An unchanged catalog stays the release it already was")
    @RequiredArgsConstructor
    public static final class Publish extends JsonHandler<Void, Localization.ReleaseView> {
        private final CatalogService catalogs;
        @Override public Localization.ReleaseView handle(Request req, Response res, Void ignored) {
            res.status(201);
            return catalogs.publish(LocalizationHandlers.project(req), req.param("locale"));
        }
    }

    @GET("/api/projects/{project}/catalogs/{locale}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The current release's hash.",
                  description = "It addresses the catalog itself.",
                  tags = "Delivery")
    @RequiredArgsConstructor
    public static final class Manifest extends JsonHandler<Void, Localization.ReleaseView> {
        private final CatalogService catalogs;
        @Override public Localization.ReleaseView handle(Request req, Response res, Void ignored) {
            res.header("Cache-Control", "private, no-cache");
            return catalogs.manifest(LocalizationHandlers.project(req), req.param("locale"));
        }
    }

    /** A catalog never changes under its hash, so it is cached for a year and revalidated by ETag (§10). */
    @GET("/api/projects/{project}/catalogs/{locale}/{hash}")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @Limit(requests = 120, window = 1, windowUnit = TimeUnit.MINUTES)
    @ApiOperation(summary = "The published catalog with that hash.", tags = "Delivery")
    @APIResponse(responseCode = "304", description = "Unchanged, as the ETag said")
    @APIResponse(responseCode = "404", description = "No catalog with that hash")
    @RequiredArgsConstructor
    public static final class Catalog extends JsonHandler<Void, Object> {
        private final CatalogService catalogs;
        @Override public Object handle(Request req, Response res, Void ignored) {
            String etag = "\"" + req.param("hash") + "\"";
            String artifact = catalogs.catalog(LocalizationHandlers.project(req), req.param("locale"), req.param("hash"));
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
