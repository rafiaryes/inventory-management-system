import { createApp } from "./app";

const DEFAULT_PORT = 3001;

function resolvePort(rawPort: string | undefined): number {
  const normalized = rawPort?.trim();
  if (!normalized) {
    return DEFAULT_PORT;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT environment variable: "${rawPort}"`);
  }

  return parsed;
}

const port = resolvePort(process.env.PORT);
const app = createApp().listen(port);

console.log(
  `IMS backend listening at http://${app.server?.hostname}:${app.server?.port}`,
);
