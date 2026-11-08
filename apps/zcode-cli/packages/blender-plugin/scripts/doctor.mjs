import { diagnose } from "./diagnostics.mjs";

const report = await diagnose();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ready ? 0 : 1;
