import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export async function downloadUrlToFile(url: string, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });

  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) throw new Error("Invalid data URL");
    await writeFile(outPath, Buffer.from(m[2]!, "base64"));
    return;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url.slice(0, 120)}`);
  if (!res.body) {
    await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
    return;
  }
  const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(outPath));
}
