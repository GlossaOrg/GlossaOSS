package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.schema.Localization.LocaleConfig;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.LocaleService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** {@code /api/projects/{project}/locales} routes over {@link LocaleService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class LocaleHandlers {

    @GET("/api/projects/{project}/locales")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's locales.",
                  description = "With the plural categories each needs. A caller whose role is one locale's passes it as locale.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Locales extends JsonHandler<Void, List<Localization.LocaleView>> {
        private final LocaleService locales;
        @Override public List<Localization.LocaleView> handle(Request req, Response res, Void ignored) {
            return locales.locales(LocalizationHandlers.project(req));
        }
    }

    @PUT("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Enables a locale or changes its fallback.", tags = "Localization")
    @RequiredArgsConstructor
    public static final class ConfigureLocale extends JsonHandler<LocaleConfig, Localization.LocaleView> {
        private final LocaleService locales;
        @Override public Localization.LocaleView handle(Request req, Response res, LocaleConfig body) throws Exception {
            return locales.configureLocale(LocalizationHandlers.project(req), req.param("locale"), body);
        }
    }

    @DELETE("/api/projects/{project}/locales/{locale}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Removes a translation locale.",
                  description = "With every revision, release and log entry written in it.",
                  tags = "Localization")
    @APIResponse(responseCode = "204", description = "Removed with everything written in it")
    @APIResponse(responseCode = "409", description = "The source locale cannot be removed")
    @RequiredArgsConstructor
    public static final class RemoveLocale extends JsonHandler<Void, Object> {
        private final LocaleService locales;
        @Override public Object handle(Request req, Response res, Void ignored) {
            locales.removeLocale(LocalizationHandlers.project(req), req.param("locale"));
            res.status(204);
            return null;
        }
    }
}
