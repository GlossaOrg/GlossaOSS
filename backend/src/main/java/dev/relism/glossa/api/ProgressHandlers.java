package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.Authenticated;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.GET;
import dev.relism.glossa.schema.Localization;
import dev.relism.glossa.service.ProgressService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** {@code /api/projects/{project}/progress} over {@link ProgressService}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ProgressHandlers {

    @GET("/api/projects/{project}/progress")
    @Authenticated
    @ApiOperation(summary = "Where every locale stands.",
                  description = "Each locale the caller may read, its resources counted by state, and its newest release.",
                  tags = "Localization")
    @APIResponse(responseCode = "403", description = "No locale of this project is the caller's to read")
    @RequiredArgsConstructor
    public static final class Progress extends JsonHandler<Void, List<Localization.Progress>> {
        private final ProgressService progress;
        @Override public List<Localization.Progress> handle(Request req, Response res, Void ignored) {
            return progress.progress(LocalizationHandlers.project(req));
        }
    }
}
