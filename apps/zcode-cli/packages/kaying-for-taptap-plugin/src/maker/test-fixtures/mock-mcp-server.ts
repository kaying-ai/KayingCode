/** Test-only newline-delimited JSON-RPC server used by mcp-client.test.ts. */

const mode = process.argv[2] ?? "success";
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) handleLine(line);
    newlineIndex = buffer.indexOf("\n");
  }
});

function handleLine(line: string): void {
  const request = JSON.parse(line) as {
    id?: number;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };
  if (request.method === "initialize") {
    if (mode === "invalid") {
      process.stdout.write("not-json\n");
      return;
    }
    write({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2024-11-05" } });
    return;
  }
  if (request.method === "tools/call") {
    write({
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: { message: "building", progress: 1, total: 2 },
    });
    write({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        isError: false,
        content: [{ type: "text", text: `${request.params?.name}:ok` }],
        echo: request.params?.arguments,
        maker_environment: process.env.TAPTAP_MCP_ENV ?? null,
      },
    });
  }
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
