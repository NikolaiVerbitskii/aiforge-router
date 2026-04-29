import { describe, expect, it } from "vitest";
import { IntegrationsService } from "./integrations.service";
import { WorkflowService } from "./workflow.service";

describe("hybrid-core services", () => {
  it("returns workflow status payload", () => {
    const workflow = new WorkflowService();
    expect(workflow.getStatus().service).toBe("hybrid-core");
  });

  it("returns integration targets", () => {
    const integrations = new IntegrationsService();
    const targets = integrations.getTargets();
    expect(targets.ollamaHost).toContain("http");
    expect(targets.hermesHost).toContain("http");
  });
});
