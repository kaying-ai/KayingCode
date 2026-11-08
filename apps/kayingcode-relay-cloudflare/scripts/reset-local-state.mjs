import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const stateDir = fileURLToPath(new URL("../.wrangler/state/", import.meta.url));
await rm(stateDir, { recursive: true, force: true });
console.log(`已清空本地 Durable Object 状态：${stateDir}`);
