import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { deployLogLine, readDeployConfig } from "./config.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(serverRoot, "..");
loadEnv({ path: resolve(repoRoot, ".env") });
loadEnv({ path: resolve(serverRoot, ".env") });

export async function main(): Promise<void> {
  const deployConfig = readDeployConfig(process.env);
  const app = await createApp();
  const server = app.listen(deployConfig.port, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : deployConfig.port;
    console.log(deployLogLine({ ...deployConfig, port }, Boolean(deployConfig.databaseUrl)));
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
