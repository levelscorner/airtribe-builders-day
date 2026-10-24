import { join } from "node:path";
import sharp from "sharp";
import { env } from "../env.js";
import { assetUrlFromPath } from "../jobs/store.js";
import { callMcpTool } from "../mcp/client.js";
import { downloadUrlToFile } from "../mcp/download.js";
import { resolveAssetUrlFromToolResult, withOneRetry } from "../mcp/poll.js";
import { getMcpServer } from "../mcp/registry.js";
import type { SceneVisual, VisualsProvider, VisualsRequest } from "./types.js";

const W = 1080;
const H = 1920;

/**
 * OpenArt visuals via MCP (https://mcp.openart.ai/mcp).
 * OpenArt has no public REST API key program — MCP (+ OAuth/token) is the supported path.
 * If MCP is not connected, this adapter fails with setup guidance (documented stub behavior).
 */
export class OpenArtVisualsProvider implements VisualsProvider {
  readonly id = "openart" as const;

  async generateSceneVisual(req: VisualsRequest): Promise<SceneVisual> {
    const server = getMcpServer("openart");
    if (!server) {
      throw new Error(
        [
          "OpenArt MCP not connected.",
          "OpenArt has no public REST API; use MCP at https://mcp.openart.ai/mcp.",
          "Set OPENART_MCP_URL + OPENART_MCP_TOKEN (Bearer/OAuth access token),",
          "or switch VISUALS_PROVIDER=higgsfield|mock. See docs/11-chotu-mini.md.",
        ].join(" "),
      );
    }

    const prompt = `${req.prompt}. Kid-safe, no text overlays, vertical 9:16, style: ${req.style}.`;
    const imagePath = join(req.imagesDir, `scene-${req.sceneIndex}.png`);
    const meta: Record<string, unknown> = { via: "mcp" };

    const imageRemote = await withOneRetry(async () => {
      const { toolName, result } = await callMcpTool(
        server.tools,
        env.openartImageTool,
        { prompt, aspect_ratio: "9:16", aspectRatio: "9:16" },
        ["generate_image", "text_to_image", "image_generate", "create_image"],
      );
      meta.imageTool = toolName;
      return resolveAssetUrlFromToolResult(result, {
        tools: server.tools,
        statusToolName: env.openartStatusTool,
        statusAliases: ["get_generation", "status", "get_job", "check_status"],
        statusArgs: (jobId) => ({ id: jobId, generation_id: jobId, job_id: jobId }),
        timeoutMs: env.mcpPollTimeoutMs,
        intervalMs: env.mcpPollIntervalMs,
        preferExt: ["png", "jpg", "jpeg", "webp"],
      });
    }, "openart-image");

    await downloadUrlToFile(imageRemote, imagePath);
    const normalized = `${imagePath}.norm.png`;
    await sharp(imagePath).resize(W, H, { fit: "cover" }).png().toFile(normalized);
    await sharp(normalized).toFile(imagePath);

    const imageUrl = assetUrlFromPath(imagePath);

    try {
      const videoPath = join(req.videosDir, `scene-${req.sceneIndex}.mp4`);
      const videoRemote = await withOneRetry(async () => {
        const { toolName, result } = await callMcpTool(
          server.tools,
          env.openartVideoTool,
          {
            prompt: `Gentle motion, kid-friendly. ${prompt}`,
            image_url: imageRemote,
            imageUrl: imageRemote,
            duration: 5,
          },
          ["generate_video", "image_to_video", "img2vid", "create_video"],
        );
        meta.videoTool = toolName;
        return resolveAssetUrlFromToolResult(result, {
          tools: server.tools,
          statusToolName: env.openartStatusTool,
          statusAliases: ["get_generation", "status", "get_job", "check_status"],
          statusArgs: (jobId) => ({ id: jobId, generation_id: jobId, job_id: jobId }),
          timeoutMs: env.mcpPollTimeoutMs,
          intervalMs: env.mcpPollIntervalMs,
          preferExt: ["mp4", "webm"],
        });
      }, "openart-video");

      await downloadUrlToFile(videoRemote, videoPath);
      return {
        kind: "video",
        imagePath,
        imageUrl,
        videoPath,
        videoUrl: assetUrlFromPath(videoPath),
        provider: this.id,
        meta,
      };
    } catch (err) {
      meta.videoError = err instanceof Error ? err.message : String(err);
      return { kind: "image", imagePath, imageUrl, provider: this.id, meta };
    }
  }
}
