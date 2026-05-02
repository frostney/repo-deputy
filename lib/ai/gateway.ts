import { gateway } from "@ai-sdk/gateway";

export function getGatewayModel() {
  return gateway(process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-4.6");
}
