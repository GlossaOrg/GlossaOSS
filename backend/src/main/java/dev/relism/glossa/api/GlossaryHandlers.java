package dev.relism.glossa.api;

import dev.relism.flash.ext.jackson.json.JsonHandler;
import dev.relism.flash.ext.openapi.APIResponse;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.openapi.Content;
import dev.relism.flash.ext.openapi.Parameter;
import dev.relism.flash.ext.openapi.ParameterIn;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.extension.Inject;
import dev.relism.flash.models.Request;
import dev.relism.flash.models.RequestHandler;
import dev.relism.flash.models.Response;
import dev.relism.flash.routing.DELETE;
import dev.relism.flash.routing.GET;
import dev.relism.flash.routing.PUT;
import dev.relism.glossa.schema.Glossary.NewTerm;
import dev.relism.glossa.schema.Glossary.TermView;
import dev.relism.glossa.service.GlossaryService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.util.List;

/** §6's glossary: a manager's to write, anybody working in the locale reads it. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class GlossaryHandlers {

    /** Every route here works through GlossaryService; one that also reads a body extends {@link Body}. */
    private abstract static class Base extends RequestHandler { @Inject protected GlossaryService glossary; }
    private abstract static class Body<B> extends JsonHandler<B> { @Inject protected GlossaryService glossary; }

    @GET("/api/projects/{project}/glossary")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "The project's terminology.",
                  description = "Or what applies to one locale: a caller whose role is one locale's passes it as locale.",
                  tags = "Localization")
    @Parameter(name = "locale", in = ParameterIn.QUERY, description = "Only the terms that bind this locale, and the ones that bind every locale.")
    public static final class Terms extends Base {
        @Override public List<TermView> handle(Request req, Response res) {
            return glossary.list(LocalizationHandlers.project(req), req.query("locale"));
        }
    }

    @PUT("/api/projects/{project}/glossary")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Adds or replaces a term.",
                  description = "No translation leaves the term alone; no locale means every locale.",
                  tags = "Localization")
    public static final class Save extends Body<NewTerm> {
        @Override public TermView handle(Request req, Response res, NewTerm body) throws Exception {
            return glossary.save(LocalizationHandlers.project(req), body);
        }
    }

    @DELETE("/api/projects/{project}/glossary/{term}")
    @RolesAllowed(value = "MANAGER", on = "project")
    @ApiOperation(summary = "Removes one term.", tags = "Localization")
    @APIResponse(responseCode = "204", description = "Removed")
    @APIResponse(responseCode = "404", description = "No such term in this project")
    public static final class Remove extends Base {
        @Override public Object handle(Request req, Response res) {
            glossary.remove(LocalizationHandlers.project(req), Long.parseLong(req.param("term")));
            res.status(204);
            return null;
        }
    }
}
