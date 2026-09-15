package dev.relism.glossa.mcp;

import dev.relism.flash.ext.mcp.McpTool;
import dev.relism.flash.ext.mcp.TextContent;
import dev.relism.flash.ext.mcp.Tool;
import dev.relism.flash.ext.mcp.ToolArguments;
import dev.relism.flash.ext.mcp.ToolResponse;
import dev.relism.glossa.GlossaApp;

/**
 * Connectivity and version check — the MCP counterpart of
 * {@link dev.relism.glossa.api.MetaHandlers.Health}, so an agent can confirm which build it is talking
 * to before issuing real calls. The §12 tools (listing untranslated content, reviewing
 * suggestions, approving proposals, searching for inconsistencies, creating schemas and keys)
 * land alongside it in this package as the domain arrives.
 */
@Tool(name = "glossa_status", description = "Report the Glossa server's name and version.")
public final class StatusTool extends McpTool {

    @Override
    public ToolResponse call(ToolArguments args) {
        return ToolResponse.success(new TextContent("glossa " + GlossaApp.VERSION));
    }
}
