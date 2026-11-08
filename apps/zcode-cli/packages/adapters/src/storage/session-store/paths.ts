import { homedir } from "node:os";
import { join } from "node:path";

export function getDefaultSessionDbPath(): string {
  return join(
    process.env.KAYINGCODE_DATA_BASE_DIR?.trim() || homedir(),
    ".kayingcode",
    "cli",
    "db",
    "db.sqlite",
  );
}
