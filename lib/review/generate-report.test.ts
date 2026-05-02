import { describe, expect, test } from "bun:test";
import { readAiGatewayTimeoutMs } from "./generate-report";

describe("readAiGatewayTimeoutMs", () => {
  test("uses the production-safe default when unset or invalid", () => {
    expect(readAiGatewayTimeoutMs(undefined)).toBe(6000);
    expect(readAiGatewayTimeoutMs("not-a-number")).toBe(6000);
    expect(readAiGatewayTimeoutMs("999")).toBe(6000);
  });

  test("allows bounded Gateway timeouts", () => {
    expect(readAiGatewayTimeoutMs("12000")).toBe(12000);
    expect(readAiGatewayTimeoutMs("60000")).toBe(25000);
  });
});
