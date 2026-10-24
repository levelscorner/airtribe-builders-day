export interface DeployConfig {
  port: number;
  mock: boolean;
  /** Fake Pine Labs link. Defaults on unless PINE_LABS_MOCK is explicitly off. */
  pineLabsMock: boolean;
  databaseUrl: string;
  publicBaseUrl: string;
  pineMerchantId: string;
  pineApiKey: string;
  pineWebhookSecret: string;
  renderApiKey: string;
  renderTask: string;
  starterCredits: number;
}

/** Reads the docs/14 env table. Secrets stay in the returned object and are not logged. */
export function readDeployConfig(env: NodeJS.ProcessEnv): DeployConfig {
  const port = Number(env.PORT || 8787);
  return {
    port: Number.isFinite(port) && port >= 0 ? port : 8787,
    mock: env.MOCK === "1",
    pineLabsMock: pineLabsMockFrom(env.PINE_LABS_MOCK),
    databaseUrl: env.DATABASE_URL?.trim() ?? "",
    publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 8787}`).replace(/\/$/, ""),
    pineMerchantId: env.PINE_LABS_MERCHANT_ID?.trim() ?? "",
    pineApiKey: env.PINE_LABS_API_KEY?.trim() ?? "",
    pineWebhookSecret: env.PINE_LABS_WEBHOOK_SECRET?.trim() ?? "",
    renderApiKey: env.RENDER_API_KEY?.trim() ?? "",
    renderTask: env.RENDER_WORKFLOW_TASK?.trim() || "chotu-render/assemble",
    starterCredits: positiveInt(env.STARTER_CREDITS),
  };
}

export function deployLogLine(config: DeployConfig, database: boolean): string {
  return [
    `Chotu listening on ${config.port}`,
    `mock=${config.mock}`,
    `db=${database}`,
    `pineMock=${config.pineLabsMock}`,
    `pine=${Boolean(config.pineMerchantId && config.pineApiKey && config.pineWebhookSecret)}`,
    `render=${Boolean(config.renderApiKey)}`,
    `starterCredits=${config.starterCredits}`,
  ].join(" ");
}

const PINE_MOCK_OFF = new Set(["0", "false", "off", "no"]);

function pineLabsMockFrom(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true;
  return !PINE_MOCK_OFF.has(value.trim().toLowerCase());
}

function positiveInt(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
