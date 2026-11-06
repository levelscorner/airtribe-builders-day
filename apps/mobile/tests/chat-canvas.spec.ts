import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

const review = resolve(__dirname, "../../../.impeccable/review");
const detailed =
  "Create a 45 second English cartoon video explaining why bees make honey for kids in vertical format, 1080p, with Chintu and Mini.";
async function start(page: Page, prompt = detailed) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Describe your video" }).fill(prompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Test creator");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(
      `creator-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\//);
}
async function state(page: Page) {
  const id = new URL(page.url()).pathname.split("/").pop();
  return (await page.request.get(`/v1/chats/${id}`)).json();
}
async function screenshot(page: Page, name: string) {
  if (process.env.CHOTU_CAPTURE !== "1") return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelector(".conversation-scroll")?.scrollTo(0, 0);
  });
  // Settle authored motion before recording evidence.
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(review, name), fullPage: true });
}

test("home drafts and actual reference files recover after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await screenshot(page, "home-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "home-mobile.png");
  await page
    .getByRole("textbox", { name: "Describe your video" })
    .fill("A story about bees");
  await page.locator("input[type=file]").setInputFiles({
    name: "reference.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Warm morning light"),
  });
  await expect(page.getByRole("link", { name: "reference.txt" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Describe your video" }),
  ).toHaveValue("A story about bees");
  await expect(
    page.getByRole("link", { name: "reference.txt" }),
  ).toHaveAttribute("href", /^blob:/);
  await page.getByRole("button", { name: "Remove reference.txt" }).click();
  await expect(page.getByRole("link", { name: "reference.txt" })).toHaveCount(
    0,
  );
});

test("detailed prompt, script revision loop, frame review and targeted regeneration use server state", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await start(page);
  await expect(
    page.getByRole("heading", { name: "Your script", exact: true }),
  ).toBeVisible();
  let chat = await state(page);
  expect(chat.stage).toBe("script");
  expect(
    chat.messages.filter((m: { kind: string }) => m.kind === "question"),
  ).toHaveLength(0);
  expect(chat.artefacts.map((a: { kind: string }) => a.kind)).toEqual([
    "script",
  ]);
  expect(chat.artefacts[0].payload.scenes[0].narration).not.toContain(
    "45 second",
  );
  await screenshot(page, "script-desktop.png");
  for (const [i, note] of [
    "Make the opening simpler",
    'Replace the opening with "Bees have a sweet secret!"',
  ].entries()) {
    await page.getByRole("textbox", { name: "Message SLB2" }).fill(note);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page.getByRole("button", { name: "Regenerate", exact: true }).click();
    await expect(page.getByLabel("Script version")).toHaveValue(String(i + 2));
    chat = await state(page);
    expect(chat.stage).toBe("script");
    expect(chat.artefacts).toHaveLength(1);
    expect(chat.artefacts[0].version).toBe(i + 2);
  }
  expect(chat.artefacts[0].payload.scenes[0].narration).toBe(
    "Bees have a sweet secret!",
  );
  await page.reload();
  await expect(page.getByLabel("Script version")).toHaveValue("3");
  await page.getByLabel("Script version").selectOption("1");
  await expect(
    page.getByRole("button", { name: "Approve script & explore visuals" }),
  ).toHaveCount(0);
  await page.getByLabel("Script version").selectOption("3");
  await page
    .getByRole("button", { name: "Approve script & explore visuals" })
    .click();
  const canvas = page.getByRole("complementary", { name: "Visual canvas" });
  await expect(canvas).toHaveAttribute("aria-hidden", "false");
  await expect(canvas.locator(".frame-card")).toHaveCount(2);
  await screenshot(page, "desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "mobile.png");
  if (process.env.CHOTU_CAPTURE === "1") {
    await page.locator(".character-grid").scrollIntoViewIfNeeded();
    await screenshot(page, "characters-mobile.png");
  }
  await expect(page.locator(".conversation")).toHaveCSS("visibility", "hidden");
  await page.getByRole("button", { name: "Close canvas" }).click();
  await expect(
    page.getByRole("textbox", { name: "Message SLB2" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Visual canvas", exact: true })
    .click();
  await canvas.locator(".frame-card").first().click();
  await page
    .getByRole("button", { name: "Suggest a change", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message SLB2" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Message SLB2" })
    .fill("Make this scene warmer");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(canvas.locator(".frame-title").first()).toContainText("v2");
  chat = await state(page);
  const frames = chat.artefacts.filter(
    (a: { kind: string }) => a.kind === "image",
  );
  expect(
    frames.filter((a: { version: number }) => a.version === 2),
  ).toHaveLength(1);
  expect(chat.stage).toBe("cast");
  expect(chat.artefacts.some((a: { kind: string }) => a.kind === "clip")).toBe(
    false,
  );
  await page
    .getByRole("textbox", { name: "Message SLB2" })
    .fill("Use softer light for every scene");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Update all 2 scenes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.locator(".revision-confirm")).toHaveCount(0);
  chat = await state(page);
  expect(
    chat.artefacts.filter(
      (a: { kind: string; version: number }) =>
        a.kind === "image" && a.version >= 2,
    ),
  ).toHaveLength(2);
  await page.reload();
  await expect(canvas).toHaveAttribute("aria-hidden", "false");
  await page
    .getByRole("button", { name: "Approve visuals & continue" })
    .click();
  await expect.poll(async () => (await state(page)).stage).toBe("clips");
  expect(runtimeErrors).toEqual([]);
});

test("vague prompt asks one question at a time, supports typed choices and recovers intake", async ({
  page,
}) => {
  await start(page, "bees");
  await page.getByRole("button", { name: "Kids edu-fun", exact: true }).click();
  await expect(
    page.getByText("Where will your video live?", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".configuration-block")).toHaveCount(1);
  await expect(page.locator(".past-question")).toHaveCount(0);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Message SLB2" }).fill("landscape");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("How long should the story be?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Where will your video live?", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".configuration-block")).toHaveCount(1);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await screenshot(page, "configuration-desktop.png");
  await page.reload();
  await expect(
    page.getByText("How long should the story be?", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose the remaining details for me" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your script", exact: true }),
  ).toBeVisible();
  const chat = await state(page);
  const video = await (
    await page.request.get(`/v1/videos/${chat.videoId}`)
  ).json();
  expect(video.video.aspectRatio).toBe("16:9");
  expect(video.video.language).toBe("en");
  await expect(
    page.getByRole("region", { name: "Video configuration summary" }),
  ).toHaveCount(1);
  await expect(page.locator(".configuration-block")).toHaveCount(0);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".configuration-summary")).toContainText(
    "45 seconds",
  );
  await expect(page.locator(".configuration-summary")).toContainText("16:9");
  await screenshot(page, "configuration-summary-desktop.png");
});

test("server errors and insufficient revision credits keep work reviewable", async ({
  page,
}) => {
  await page.route("**/v1/chats", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Preview temporarily unavailable. Try again.",
      }),
    }),
  );
  await start(page).catch(() => {});
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.unroute("**/v1/chats");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your script", exact: true }),
  ).toBeVisible();
  await page.route("**/regenerate?confirm=0", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        artefactId: "sample",
        creditCost: 3,
        balance: 0,
        canAfford: false,
      }),
    }),
  );
  await page
    .getByRole("textbox", { name: "Message SLB2" })
    .fill("Simpler opening");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeVisible();
  await expect(
    page.getByText("Not enough sample credits for this revision."),
  ).toHaveCount(0);
  expect((await state(page)).stage).toBe("script");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message SLB2" })).toHaveValue(
    "Simpler opening",
  );
});

test("phone keyboard flow and Hindi content fit with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(
    page,
    "45 second Hindi cartoon video about why bees make honey for kids in vertical format, 1080p, with Chintu and Mini",
  );
  await expect(page.locator(".script-scenes")).toContainText("मधुमक्खियाँ");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Approve script & explore visuals" })
    .click();
  await expect(
    page.getByRole("button", { name: "Close canvas" }),
  ).toBeFocused();
  const firstFrame = page.locator(".frame-card").first();
  await expect(firstFrame).toBeVisible();
  await firstFrame.click();
  await expect(
    page.getByRole("button", { name: "Back to canvas", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".canvas-overview")).toHaveAttribute("inert", "");
  await screenshot(page, "inspector-mobile.png");
  await page.keyboard.press("Escape");
  await expect(firstFrame).toBeFocused();
  await expect(page.locator(".canvas-overview")).not.toHaveAttribute(
    "inert",
    "",
  );
  const character = page.locator(".character-reference.is-sheet .real-frame").first();
  await expect(character).toBeVisible();
  const bounds = await character.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width / bounds!.height).toBeCloseTo(1.5, 1);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Message SLB2" }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("complementary", {
      name: "Visual canvas",
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-hidden", "true");
});

test("SLB2 branding, generated script review and live media contract render without sample substitutions", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { ok: true, mock: false, memory: true, llm: "claude" },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Wake up to Reality" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "SLB2 home" })).toBeVisible();
  await expect(page).toHaveTitle("SLB2 — Video Studio");
  await start(page);
  await page.route(/\/v1\/chats\/[^/?]+$/, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const item of data.artefacts ?? []) {
      if (item.kind === "script") {
        item.provider = "anthropic";
        item.model = "claude-sonnet-4-5";
        item.providerLabel = "Claude";
        item.agentReview = {
          status: "completed",
          confidence: 0.91,
          output: ["Make the opening clearer.", "Keep each line short."],
        };
        item.payload.agentReview = {
          status: "mocked",
          output: "This payload fallback must not win.",
        };
      }
      if (["image", "sheet", "anchor"].includes(item.kind)) {
        item.payload.url = `/test-media/${item.kind}-${item.id}.jpg`;
        item.payload.provider = "higgsfield";
        item.payload.model = "alibaba/qwen-image-3/text-to-image";
        delete item.payload.providerLabel;
        item.provider = "higgsfield";
        item.model = "alibaba/qwen-image-3/text-to-image";
        delete item.providerLabel;
      }
    }
    await route.fulfill({ response, json: data });
  });
  await page.route("**/test-media/*.jpg", (route) =>
    route.fulfill({
      path: resolve(__dirname, "../public/demo/honey-storyboard.jpg"),
      contentType: "image/jpeg",
    }),
  );
  await page.reload();
  await expect(page.locator(".script-sample")).toContainText("Claude");
  await expect(page.locator(".script-sample")).not.toContainText("Sample");
  await page.locator(".script-review summary").click();
  await expect(page.locator(".script-review")).toContainText("91%");
  await expect(page.locator(".script-review")).not.toContainText(
    "fallback must not win",
  );
  await page.getByRole("button", { name: "Use suggestions to revise" }).click();
  await expect(
    page.getByRole("textbox", { name: "Message SLB2" }),
  ).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message SLB2" })).toHaveValue(
    /Make the opening clearer/,
  );
  // Suggestions enter the ordinary revision flow; no generation or charge without confirmation.
  expect(
    (await state(page)).artefacts.find(
      (a: { kind: string }) => a.kind === "script",
    ).version,
  ).toBe(1);
  await page.getByRole("button", { name: "Cancel revision" }).click();
  await page.getByRole("textbox", { name: "Message SLB2" }).fill("");
  await screenshot(page, "provider-script-desktop.png");
  await page
    .getByRole("button", { name: "Approve script & explore visuals" })
    .click();
  const canvas = page.getByRole("complementary", { name: "Visual canvas" });
  await expect(canvas.locator(".frame-card .real-frame")).toHaveCount(2);
  await expect(canvas.locator(".frame-card .story-art")).toHaveCount(0);
  await expect(canvas.locator(".character-reference .real-frame")).toHaveCount(
    2,
  );
  await expect(canvas.locator(".character-art")).toHaveCount(0);
  await expect(
    canvas.locator(".frame-card .provider-label").first(),
  ).toHaveText("AI-generated");
  await expect(canvas.locator(".canvas-intro .sample-label")).toHaveText(
    "AI-generated visuals",
  );
  await screenshot(page, "provider-canvas-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "provider-canvas-mobile.png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

async function reachReady(page: Page) {
  await start(page, "bees");
  await page.getByRole("button", { name: "Kids edu-fun", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose the remaining details for me" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your script", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve script & explore visuals" })
    .click();
  const canvas = page.getByRole("complementary", { name: "Visual canvas" });
  await expect(canvas.locator(".frame-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve visuals & continue" }).click();
  await expect(canvas.getByRole("button", { name: "Approve clip 1" })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Request a change" }).first()).toBeVisible();
  for (let guard = 0; guard < 20; guard += 1) {
    const stage = (await state(page)).stage as string;
    if (stage === "final" || stage === "done") break;
    const button = canvas
      .getByRole("button", { name: /^Approve (clip|voice) \d+$/ })
      .first();
    if ((await button.count()) === 0) {
      await page.waitForTimeout(400);
      continue;
    }
    const text = (await button.innerText()).trim();
    await button.click();
    await expect(
      canvas.getByRole("button", { name: text, exact: true }),
    ).toHaveCount(0);
  }
  const finalCut = canvas.getByRole("button", { name: "Approve final cut" });
  await expect(finalCut).toBeVisible({ timeout: 15_000 });
  await finalCut.click();
  await expect(
    page.getByRole("heading", { name: "Your video is ready." }),
  ).toBeVisible();
  expect((await state(page)).stage).toBe("done");
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const) {
  test(`a mock web run accepts remaining defaults and reaches Your video is ready at ${viewport.width}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await reachReady(page);
  });
}

test("provider progress events update in place and missing media never becomes a sample frame", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Approve script & explore visuals" })
    .click();
  await expect(page.locator(".frame-card").first()).toBeVisible();
  const chat = await state(page);
  const frame = chat.artefacts.find(
    (a: { kind: string }) => a.kind === "image",
  );
  await page.route(/\/v1\/chats\/[^/?]+$/, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const target = data.artefacts.find(
      (a: { id: string }) => a.id === frame.id,
    );
    if (target) {
      target.payload.url = "";
      target.payload.provider = "higgsfield";
    }
    await route.fulfill({ response, json: data });
  });
  const progress = {
    type: "media.progress",
    artefactId: frame.id,
    jobId: "fixture-job",
    kind: "image",
    provider: "higgsfield",
    model: "alibaba/qwen-image-3/text-to-image",
  };
  await page.route("**/v1/chats/*/events", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: [
        { ...progress, status: "queued" },
        { ...progress, status: "generating", percent: 62 },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(""),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Generation progress" }),
  ).toContainText("Generating 62%");
  await expect(page.locator(".generation-status > div")).toHaveCount(1);
  const canvas = page.getByRole("complementary", { name: "Visual canvas" });
  await expect(
    canvas.locator(".frame-card").first().getByText("Image not available yet"),
  ).toBeVisible();
  await expect(
    canvas.locator(".frame-card").first().locator(".story-art"),
  ).toHaveCount(0);
});
