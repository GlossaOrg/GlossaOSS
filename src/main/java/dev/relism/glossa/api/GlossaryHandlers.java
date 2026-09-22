package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.Json;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.service.GlossaryService;

/** §6's glossary: a manager's to write, anybody working in the locale reads it. */
public abstract class GlossaryHandlers extends RequestHandler {

    protected Json json;
    protected GlossaryService glossary;

    @Override
    protected void onInit() {
        json = require(Json.class);
        glossary = require(GlossaryService.class);
    }

    @GET("/api/projects/{project}/glossary")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's terminology, or what applies to one locale. A caller whose role is one locale's passes it as locale.", tags = "localization")
    public static final class Terms extends GlossaryHandlers {
        @Override public Object handle(Request req, Response res) {
            return glossary.list(LocalizationHandlers.project(req), req.query("locale"));
        }
    }

    @PUT("/api/projects/{project}/glossary")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Adds a term or replaces what it says. No translation means leave the term alone; no locale means every locale.", tags = "localization")
    public static final class Save extends GlossaryHandlers {
        @Override public Object handle(Request req, Response res) throws Exception {
            return glossary.save(LocalizationHandlers.project(req), json.body(req, GlossaryService.NewTerm.class));
        }
    }

    @DELETE("/api/projects/{project}/glossary/{term}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Removes one term.", tags = "localization")
    public static final class Remove extends GlossaryHandlers {
        @Override public Object handle(Request req, Response res) {
            glossary.remove(LocalizationHandlers.project(req), Long.parseLong(req.param("term")));
            res.status(204);
            return null;
        }
    }
}
