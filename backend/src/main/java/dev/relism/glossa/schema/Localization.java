package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import dev.relism.glossa.content.FieldType.Variable;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** What the localization routes take and answer (§5 to §8). */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Localization {

    @Schema(name = "LocaleConfig", description = "Enables a locale, or changes what it falls back to.")
    public record LocaleConfig(
            @SchemaProperty(description = "Makes this the locale everything is translated from. Only one project locale is.")
            boolean source,
            @SchemaProperty(description = "The locale to serve when this one has nothing approved. Must be enabled already.")
            String fallbackLocale) {}

    /** The service's own shape for the same thing, with the locale the route carried in its path. */
    public record LocaleRequest(String locale, boolean source, String fallbackLocale) {}

    @Schema(name = "Locale", description = "An enabled locale and the plural forms a message needs in it.")
    public record LocaleView(
            String locale,
            @SchemaProperty(description = "Whether everything is translated from this locale.")
            boolean source,
            String fallbackLocale,
            @SchemaProperty(description = "Whether the locale is written right to left.")
            boolean rtl,
            @SchemaProperty(description = "Each CLDR plural category this locale needs, with sample numbers for it.")
            Map<String, List<String>> cardinal,
            @SchemaProperty(description = "The same for ordinals: first, second, third.")
            Map<String, List<String>> ordinal) {}

    @Schema(name = "NewResource", description = "A resource and the source value it starts with, approved at once.")
    public record CreateResource(
            @SchemaProperty(description = "Unique in the project. Dots group keys without a namespace of their own: checkout.items.", required = true)
            @Pattern(regexp = "[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}", message = "uses up to 255 letters, digits, _, . and -")
            @NotNull(message = "is required")
            String key,
            @SchemaProperty(description = "What a translator needs to know to translate it well.")
            @Size(max = 255, message = "stays under 256 characters")
            String context,
            @SchemaProperty(description = "Which field type validates the payload. The message type when left out.")
            String fieldType,
            @SchemaProperty(description = "The value itself, in the shape its field type defines.", required = true)
            @NotNull(message = "is required")
            Map<String, Object> payload,
            @SchemaProperty(description = "The variables the message declares. Left out, the field type reads them off the payload.")
            Map<String, Variable> contract) {}

    @Schema(name = "NewRevision", description = "A new value for one locale: approved from a reviewer, a proposal from a translator.")
    public record Edit(
            @SchemaProperty(description = "The revision this edit was written against. The write is refused if the variant moved on.")
            Long expectedHeadRevisionId,
            @SchemaProperty(description = "The source revision this translates. Decides whether the translation reads as up to date.")
            Long sourceRevisionId,
            @SchemaProperty(required = true)
            @NotNull(message = "is required")
            Map<String, Object> payload,
            Map<String, Variable> contract) {}

    @Schema(name = "Decision", description = "A reviewer's answer to the pending proposal.")
    public record Decision(
            @SchemaProperty(description = "The proposal being answered, so two reviewers cannot answer different things.")
            long revisionId,
            @SchemaProperty(description = "True publishes it, false sends it back.")
            boolean approve) {}

    @Schema(name = "Revert", description = "Writes an earlier value again, as a new revision. Nothing is rewritten.")
    public record Revert(long revisionId, Long expectedHeadRevisionId, Long sourceRevisionId) {}

    @Schema(name = "Resource", description = "A resource with its state in one locale.")
    public record ResourceView(
            long id,
            String key,
            String context,
            String fieldType,
            boolean archived,
            Long sourceRevisionId,
            Long headRevisionId,
            Long approvedRevisionId,
            Long pendingRevisionId,
            @SchemaProperty(description = "The source moved on after this locale was last approved.")
            boolean stale,
            Map<String, Object> sourcePayload,
            @SchemaProperty(description = "What this locale serves right now. Null until something is approved in it.")
            Map<String, Object> payload) {}

    @Schema(name = "Revision", description = "One immutable value a locale had.")
    public record RevisionView(
            long id,
            String locale,
            Long basedOnSourceRevisionId,
            Map<String, Object> payload,
            Map<String, Variable> contract,
            String actor,
            @SchemaProperty(description = "Written by an API key rather than a person, so it waits for review.")
            boolean machine,
            Instant createdAt) {}

    @Schema(name = "Event", description = "One entry of the append-only change log (§8).")
    public record EventView(
            long id,
            Long revisionId,
            Long beforeRevisionId,
            Long afterRevisionId,
            @SchemaProperty(description = "What happened: edit, propose, approve, reject or revert.")
            String action,
            String actor,
            Instant createdAt) {}

    @Schema(name = "ResourceDetail", description = "A resource, the revisions of the locale asked for, and its change log.")
    public record Detail(ResourceView resource, List<RevisionView> revisions, List<EventView> events) {}

    @Schema(name = "Release", description = "A published catalog. The hash addresses the catalog itself.")
    public record ReleaseView(long version, String locale, String hash, Instant createdAt) {}

    @Schema(name = "Message", description = "A message to check or render, with the values to render it with.")
    public record MessageRequest(
            @SchemaProperty(required = true)
            @NotNull(message = "is required")
            Map<String, Object> payload,
            Map<String, Variable> contract,
            @SchemaProperty(description = "One value per variable the message declares.")
            Map<String, Object> values,
            @SchemaProperty(description = "Checks it as something publishable: every plural form the locale needs must be there.")
            boolean complete) {}

    @Schema(name = "SuggestionRequest", description = "What to translate (§9). Nothing is stored and nothing is written.")
    public record Suggest(
            @NotNull(message = "is required")
            Map<String, Object> payload,
            Map<String, Variable> contract,
            @SchemaProperty(description = "The resource's translator context, when it has one.")
            String context) {}

    @Schema(name = "Rendered", description = "A message as a reader would see it.")
    public record Rendered(
            String text,
            @SchemaProperty(description = "The locale the text actually came from, which fallbacks may change.")
            String resolvedLocale,
            long revisionId) {}

    @Schema(name = "RenderValues", description = "One value per variable the message declares.")
    public record Values(
            @NotNull(message = "is required")
            Map<String, Object> values) {}

    @Schema(name = "Archived", description = "Keeps a resource out of new catalogs, or puts it back.")
    public record Archived(boolean archived) {}
}
