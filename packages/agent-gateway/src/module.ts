export const agentGatewayModule = {
  id: "agent-gateway",
  requires: ["rpc", "services", "shared"],
  provides: ["agent-gateway-ingress", "host-capability-store"],
  publicEntrypoints: ["contract.ts"],
} as const;
