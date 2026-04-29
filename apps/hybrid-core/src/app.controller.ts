import { Controller, Get } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { WorkflowService } from "./workflow.service";

@Controller()
export class AppController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly integrationsService: IntegrationsService
  ) {}

  @Get("health")
  health() {
    return {
      ...this.workflowService.getStatus(),
      integrations: this.integrationsService.getTargets()
    };
  }
}
