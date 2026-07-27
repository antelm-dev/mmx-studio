import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(moduleDir, "..");

export const STARTER_TEMPLATE_ID = "mmx.starter";

export function resolveStarterTemplateRoot(): string {
  return join(packageRoot, "../../templates/mmx-starter");
}

export const STARTER_MANIFEST = "project.json";
export const STARTER_GAME_DATA = "game/data.json";
export const STARTER_ATTRIBUTION = "ATTRIBUTION.md";
