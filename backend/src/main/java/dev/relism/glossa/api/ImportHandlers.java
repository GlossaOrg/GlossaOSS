package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.ImportService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;

/** {@code /api/projects/{project}/imports} over {@link ImportService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ImportHandlers {

    @POST("/api/projects/{project}/imports/{locale}")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Imports messages into one locale.",
                  description = "Into the source, new keys become resources (managers only). Elsewhere each entry is the caller's own write, "
                          + "a proposal unless they review. Entries that cannot be written are listed, the rest still go in.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class ImportMessages extends JsonHandler<Localization.Import, Localization.Imported> {
        private final ImportService imports;
        @Override public Localization.Imported handle(Request req, Response res, Localization.Import body) {
            return imports.importMessages(LocalizationHandlers.project(req), req.param("locale"), body);
        }
    }
}
