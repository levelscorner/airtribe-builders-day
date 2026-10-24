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

const STYLE_SUFFIX: Record<string, string> = {
  "watercolor-storybook":
    "soft watercolor storybook illustration, gentle washes, warm paper, kid-safe, no text",
  cartoon: "bright flat cartoon for kids, bold outlines, cheerful, kid-safe, no text",
};

export class HiggsfieldVisualsProvider implements VisualsProvider {
  readonly id = "higgsfield" as const;

  async generateSceneVisual(req: VisualsRequest): Promise<SceneVisual> {
    const server = getMcpServer("higgsfield");
    if (!server) {
      throw new Error(
        "Higgsfield MCP not connected. Set HIGGSFIELD_MCP_URL + HIGGSFIELD_MCP_TOKEN (or MOCK_MODE=true).",
      );
    }

    const styleHint = STYLE_SUFFIX[req.style] ?? STYLE_SUFFIX["watercolor-storybook"];
    const prompt = `${req.prompt}. ${styleHint}. Vertical 9:16 composition.`;

    const imagePath = join(req.imagesDir, `scene-${req.sceneIndex}.png`);
    const meta: Record<string, unknown> = { via: "mcp" };

    const imageUrlRemote = await withOneRetry(async () => {
      const { toolName, result } = await callMcpTool(
        server.tools,
        env.higgsfieldImageTool,
        {
          prompt,
          aspect_ratio: "9:16",
          aspectRatio: "9:16",
        },
        ["generate_image", "text_to_image", "image_generate", "soul", "create_image"],
      );
      meta.imageTool = toolName;
      return resolveAssetUrlFromToolResult(result, {
        tools: server.tools,
        statusToolName: env.higgsfieldStatusTool,
        statusAliases: ["get_generation", "get_request", "status", "check_status", "get_job"],
        statusArgs: (jobId) => ({ id: jobId, request_id: jobId, generation_id: jobId, job_id: jobId }),
        timeoutMs: env.mcpPollTimeoutMs,
        intervalMs: env.mcpPollIntervalMs,
        preferExt: ["png", "jpg", "jpeg", "webp"],
      });
    }, "higgsfield-image");

    await downloadUrlToFile(imageUrlRemote, imagePath);
    const normalized = `${imagePath}.norm.png`;
    await sharp(imagePath).resize(W, H, { fit: "cover" }).png().toFile(normalized);
    await sharp(normalized).toFile(imagePath);

    const imageUrl = assetUrlFromPath(imagePath);

    if (!env.higgsfieldEnableI2v) {
      return { kind: "image", imagePath, imageUrl, provider: this.id, meta };
    }

    try {
      const videoPath = join(req.videosDir, `scene-${req.sceneIndex}.mp4`);
      const videoRemote = await withOneRetry(async () => {
        const { toolName, result } = await callMcpTool(
          server.tools,
          env.higgsfieldVideoTool,
          {
            prompt: `Gentle kid-friendly camera motion, soft parallax. ${styleHint}`,
            image_url: imageUrlRemote,
            imageUrl: imageUrlRemote,
            duration: 5,
          },
          ["image_to_video", "img2vid", "i2v", "generate_video", "video_from_image"],
        );
        meta.videoTool = toolName;
        return resolveAssetUrlFromToolResult(result, {
          tools: server.tools,
          statusToolName: env.higgsfieldStatusTool,
          statusAliases: ["get_generation", "get_request", "status", "check_status", "get_job"],
          statusArgs: (jobId) => ({ id: jobId, request_id: jobId, generation_id: jobId, job_id: jobId }),
          timeoutMs: env.mcpPollTimeoutMs,
          intervalMs: env.mcpPollIntervalMs,
          preferExt: ["mp4", "webm"],
        });
      }, "higgsfield-i2v");

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
      meta.i2vError = err instanceof Error ? err.message : String(err);
      return { kind: "image", imagePath, imageUrl, provider: this.id, meta };
    }
  }
}
