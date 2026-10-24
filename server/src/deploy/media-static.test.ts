import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import request from "supertest";
import sharp from "sharp";
import { mediaRoot, savePng } from "../media/files.js";
import { startServer } from "./start.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;
delete process.env.MEDIA_ROOT;

test("a saved PNG is served from the shared media directory", async () => {
  const started = await startServer({ listen: false });
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 40, b: 80 } },
  })
    .png()
    .toBuffer();
  const id = "served-still";
  const file = join(mediaRoot(process.env), "images", `${id}.png`);
  try {
    const url = await savePng(process.env, id, png);
    assert.match(url, /\/media\/images\/served-still\.png$/);
    const response = await request(started.app)
      .get("/media/images/served-still.png")
      .responseType("blob")
      .expect(200);
    assert.match(String(response.headers["content-type"]), /image\/png/);
    assert.equal(Buffer.compare(Buffer.from(response.body), png), 0);
  } finally {
    await rm(file, { force: true });
    await started.db.close();
  }
});
