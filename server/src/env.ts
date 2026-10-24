import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

export type VisualsProviderId = "mock" | "higgsfield" | "openart";
export type McpTransportKind = "http" | "sse";

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function transport(raw: string | undefined, fallback: McpTransportKind): McpTransportKind {
  const v = (raw || fallback).toLowerCase();
  return v === "sse" ? "sse" : "http";
}

const openaiKey = process.env.OPENAI_API_KEY?.trim() || "";
const elevenKey = process.env.ELEVENLABS_API_KEY?.trim() || "";
const elevenVoice = process.env.ELEVENLABS_VOICE_ID?.trim() || "";

const explicitMock = process.env.MOCK_MODE !== undefined ? truthy(process.env.MOCK_MODE) : null;

/** Higgsfield and OpenArt stay in the type union. The running server always uses mock visuals. */
const visualsProvider = "mock" as VisualsProviderId;

/** Mock when explicitly set, or when the legacy booth keys are missing. Visuals stay on mock. */
export const MOCK_MODE =
  explicitMock === true || (explicitMock !== false && (!openaiKey || !elevenKey || !elevenVoice));

export const env = {
  port: Number(process.env.PORT || 8787),
  mockMode: MOCK_MODE,
  openaiApiKey: openaiKey,
  visualsProvider,
  mockVisualsClips: truthy(process.env.MOCK_VISUALS_CLIPS),

  // --- Higgsfield MCP ---
  higgsfieldMcpUrl: process.env.HIGGSFIELD_MCP_URL?.trim() || "https://mcp.higgsfield.ai/mcp",
  higgsfieldMcpToken: process.env.HIGGSFIELD_MCP_TOKEN?.trim() || "",
  higgsfieldMcpTransport: transport(process.env.HIGGSFIELD_MCP_TRANSPORT, "http"),
  higgsfieldImageTool: process.env.HIGGSFIELD_IMAGE_TOOL?.trim() || "generate_image",
  higgsfieldVideoTool: process.env.HIGGSFIELD_VIDEO_TOOL?.trim() || "image_to_video",
  higgsfieldStatusTool: process.env.HIGGSFIELD_STATUS_TOOL?.trim() || "get_generation",
  higgsfieldEnableI2v: process.env.HIGGSFIELD_ENABLE_I2V !== "false",

  // --- OpenArt MCP ---
  openartMcpUrl: process.env.OPENART_MCP_URL?.trim() || "https://mcp.openart.ai/mcp",
  openartMcpToken: process.env.OPENART_MCP_TOKEN?.trim() || "",
  openartMcpTransport: transport(process.env.OPENART_MCP_TRANSPORT, "http"),
  openartImageTool: process.env.OPENART_IMAGE_TOOL?.trim() || "generate_image",
  openartVideoTool: process.env.OPENART_VIDEO_TOOL?.trim() || "generate_video",
  openartStatusTool: process.env.OPENART_STATUS_TOOL?.trim() || "get_generation",

  // --- ElevenLabs MCP + REST fallback ---
  elevenlabsMcpUrl: process.env.ELEVENLABS_MCP_URL?.trim() || "https://api.elevenlabs.io/v1/mcp",
  elevenlabsMcpTransport: transport(process.env.ELEVENLABS_MCP_TRANSPORT, "http"),
  elevenlabsTtsTool: process.env.ELEVENLABS_TTS_TOOL?.trim() || "text_to_speech",
  elevenlabsApiKey: elevenKey,
  elevenlabsVoiceId: elevenVoice,

  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8787}`).replace(
    /\/$/,
    "",
  ),
  dataDir: resolve(__dirname, "../data"),
  mcpPollTimeoutMs: Number(process.env.MCP_POLL_TIMEOUT_MS || 180_000),
  mcpPollIntervalMs: Number(process.env.MCP_POLL_INTERVAL_MS || 3_000),
};
