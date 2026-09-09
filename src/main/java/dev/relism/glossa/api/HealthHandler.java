package dev.relism.glossa.api;

import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.GET;
import dev.relism.glossa.GlossaApp;

import java.util.Map;

/** Liveness probe for the container healthcheck (see deploy/docker-compose.yml). */
@GET("/healthz")
@ApiOperation(summary = "Service name, version and liveness status.", tags = "meta")
public final class HealthHandler extends RequestHandler {

    @Override
    public Object handle(Request req, Response res) {
        return Map.of("service", "glossa", "version", GlossaApp.VERSION, "status", "ok");
    }
}
