package dev.relism.glossa.api;

import dev.relism.flash.ext.avaje.jsonb.JsonHandler;
import dev.relism.flash.ext.openapi.ApiOperation;
import dev.relism.flash.ext.security.RolesAllowed;
import dev.relism.flash.http.Request;
import dev.relism.flash.http.Response;
import dev.relism.flash.routing.POST;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.schema.Localization.MessageRequest;
import dev.relism.glossa.schema.Localization.Suggest;
import dev.relism.glossa.service.MessageService;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import java.util.Map;

/** {@code /api/projects/{project}/messages} routes over {@link MessageService}: nothing here stores anything. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class MessageHandlers {

    @POST("/api/projects/{project}/messages/{locale}/analyze")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Checks a message.",
                  description = "Reports its variables and plural branches.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Analyze extends JsonHandler<MessageRequest, MessageType.Analysis> {
        private final MessageService messages;
        @Override public MessageType.Analysis handle(Request req, Response res, MessageRequest body) throws Exception {
            return messages.analyze(LocalizationHandlers.project(req), req.param("locale"), body);
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/preview")
    @RolesAllowed(value = "READER", on = {"project", "locale"})
    @ApiOperation(summary = "Renders an unsaved message with the values given.", tags = "Localization")
    @RequiredArgsConstructor
    public static final class Preview extends JsonHandler<MessageRequest, Object> {
        private final MessageService messages;
        @Override public Object handle(Request req, Response res, MessageRequest body) throws Exception {
            return Map.of("text", messages.preview(LocalizationHandlers.project(req), req.param("locale"), body));
        }
    }

    @POST("/api/projects/{project}/messages/{locale}/translate")
    @RolesAllowed(value = "TRANSLATOR", on = {"project", "locale"})
    @ApiOperation(summary = "Suggests a translation.",
                  description = "§9. Stores nothing: the caller writes what they keep.",
                  tags = "Localization")
    @RequiredArgsConstructor
    public static final class Translate extends JsonHandler<Suggest, Map<String, Object>> {
        private final MessageService messages;
        @Override public Map<String, Object> handle(Request req, Response res, Suggest body) throws Exception {
            return messages.suggest(LocalizationHandlers.project(req), req.param("locale"), body);
        }
    }
}
