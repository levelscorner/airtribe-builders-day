import { createMockStudio } from "../src/mock-studio";
import {
  createCheckout,
  createServerCheckout,
  finishCheckout,
  listServerPacks,
  packsApiBase,
  paymentStatusFromPage,
  pollPackPayment,
  sessionFromCheckout,
  setCreateCheckout,
} from "../src/checkout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function page(status: string, orderId: string): string {
  return `<p>Payment <code>${orderId}</code> is ${status}.</p>`;
}

async function main(): Promise<void> {
  assert(packsApiBase({ EXPO_PUBLIC_API_URL: "" }) === "", "empty API url stays same-origin");
  assert(packsApiBase({ PUBLIC_BASE_URL: "http://localhost:8787/" }) === "http://localhost:8787", "public base is trimmed");
  const userId = "usr_test";
  let checkoutBody = "";
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/v1/packs") && (init?.method ?? "GET") === "GET") {
      return Response.json({
        packs: [{ id: "starter", label: "Starter", credits: 500, amountInr: 499 }],
      });
    }
    if (url.endsWith("/v1/packs/checkout")) {
      checkoutBody = String(init?.body ?? "");
      const headers = new Headers(init?.headers);
      assert(headers.get("x-user-id") === userId, "checkout sends X-User-Id");
      return Response.json({
        paymentId: "pay_1",
        status: "pending",
        checkoutUrl: "http://localhost:8787/v1/packs/mock-pay?payment_id=pay_1",
        creditsGranted: 0,
      });
    }
    if (url.includes("/v1/packs/callback")) {
      const seen = calls.filter((call) => call.includes("/v1/packs/callback")).length;
      return new Response(page(seen >= 2 ? "mocked" : "pending", "pay_1"), {
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("missing", { status: 404 });
  };

  const packs = await listServerPacks({ baseUrl: "http://localhost:8787", fetchImpl });
  assert(packs[0]?.id === "starter" && packs[0].credits === 500, "server pack catalogue");

  const session = await createServerCheckout("starter", {
    baseUrl: "http://localhost:8787",
    userId,
    fetchImpl,
  });
  assert(session.orderId === "pay_1", "order id is the payment id");
  assert(
    session.checkoutUrl === "http://localhost:8787/v1/packs/mock-pay?payment_id=pay_1",
    "checkoutUrl is the mock-pay page",
  );
  assert(JSON.parse(checkoutBody).packId === "starter", "checkout posts packId");
  assert(paymentStatusFromPage(page("pending", "pay_1")) === "pending", "pending page");
  assert(paymentStatusFromPage(page("failed", "pay_1")) === "failed", "failed page");

  const polled = await pollPackPayment({
    orderId: "pay_1",
    baseUrl: "http://localhost:8787",
    fetchImpl,
    attempts: 3,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert(polled === "mocked", "poll waits until the callback says mocked");

  const studio = createMockStudio({ delayMs: 0 });
  await studio.createUser({ displayName: "Asha" });
  const before = (await studio.getMe()).creditBalance;
  const opened: string[] = [];
  const paid = {
    orderId: "pay_screen",
    checkoutUrl: "http://localhost:8787/v1/packs/mock-pay?payment_id=pay_screen",
  };
  const outcome = await finishCheckout({
    session: paid,
    credits: 500,
    openUrl: (url) => {
      opened.push(url);
    },
    poll: async () => "mocked",
    applyCredits: (orderId, credits) => studio.noteSettledPack(orderId, credits),
  });
  assert(outcome === "success", "confirmed checkout succeeds");
  assert(opened[0] === paid.checkoutUrl, "app opens checkoutUrl");
  assert((await studio.getMe()).creditBalance === before + 500, "visible balance grows once");
  const replay = await finishCheckout({
    session: paid,
    credits: 500,
    reopen: false,
    openUrl: () => {
      throw new Error("replay should not open the page");
    },
    poll: async () => "mocked",
    applyCredits: (orderId, credits) => studio.noteSettledPack(orderId, credits),
  });
  assert(replay === "success", "replay still succeeds");
  assert((await studio.getMe()).creditBalance === before + 500, "replay does not grant again");

  let openedWhileWaiting = false;
  const waiting = await finishCheckout({
    session: paid,
    credits: 500,
    reopen: false,
    openUrl: () => {
      openedWhileWaiting = true;
    },
    poll: async () => "pending",
    applyCredits: () => {
      throw new Error("pending checkout must not credit");
    },
  });
  assert(waiting === "waiting" && !openedWhileWaiting, "pending callback leaves the order waiting");

  const closed = await finishCheckout({
    session: { orderId: "pay_mock", checkoutUrl: "mock://pine-labs/pay_mock" },
    credits: 500,
    openUrl: () => {
      throw new Error("mock locator stays closed");
    },
    poll: async () => {
      throw new Error("mock locator is not polled");
    },
  });
  assert(closed === "success", "mock locator is left to the in-memory studio");

  setCreateCheckout(async (packId) =>
    sessionFromCheckout({
      paymentId: packId,
      status: "pending",
      checkoutUrl: `http://localhost:8787/v1/packs/mock-pay?payment_id=${packId}`,
      creditsGranted: 0,
    }),
  );
  const swapped = await createCheckout("starter");
  assert(swapped.checkoutUrl?.includes("/v1/packs/mock-pay?payment_id=starter"), "setCreateCheckout is the swap point");

  let rejected = false;
  try {
    await createServerCheckout("missing", {
      baseUrl: "http://localhost:8787",
      userId,
      fetchImpl: async () => Response.json({ message: "unknown pack" }, { status: 400 }),
    });
  } catch (error) {
    rejected = error instanceof Error && error.message === "unknown pack";
  }
  assert(rejected, "server error message is shown");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
