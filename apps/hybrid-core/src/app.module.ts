import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { IntegrationsService } from "./integrations.service";
import { WorkflowService } from "./workflow.service";

@Module({
  controllers: [AppController],
  providers: [WorkflowService, IntegrationsService]
})
export class AppModule {}
