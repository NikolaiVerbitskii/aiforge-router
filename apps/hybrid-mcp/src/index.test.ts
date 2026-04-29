import { describe, expect, it } from "vitest";
import request from "supertest";
import { createHybridMcpApp } from "./index";

describe("hybrid-mcp app", () => {
  it("returns health payload", async () => {
    const app = createHybridMcpApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.service).toBe("hybrid-mcp");
  });
});
