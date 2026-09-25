package dev.relism.glossa.schema;

import dev.relism.flash.ext.openapi.Schema;
import dev.relism.flash.ext.openapi.SchemaProperty;
import io.avaje.validation.constraints.Valid;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** §9's provider settings. The key itself is never read back. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Ai {

    @Schema(name = "AiSettings", description = "Whether AI features are on, and the provider behind them.")
    public record SettingsView(
            boolean enabled,
            String baseUrl,
            String model,
            @SchemaProperty(description = "Whether a key is stored. The key itself is never answered.")
            boolean configured) {}

    @Schema(name = "AiProvider", description = "Any OpenAI-compatible provider. An absent key keeps the stored one.")
    @Valid
    public record SettingsUpdate(
            boolean enabled,
            @SchemaProperty(description = "Where /chat/completions lives.")
            String baseUrl,
            String model,
            @SchemaProperty(description = "Stored sealed. Leave it out to keep the one already there.")
            String apiKey) {}
}
