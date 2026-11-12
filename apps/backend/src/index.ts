import { createApp } from "./app";
import { getEnv } from "./config/env";
import { closeDatabase } from "./db";

const env = getEnv();
const app = createApp().listen(env.PORT);

console.log(
  `IMS backend (${env.NODE_ENV}) listening at http://${app.server?.hostname}:${app.server?.port}`,
);

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down IMS backend...`);

  try {
    await app.stop(true);
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
