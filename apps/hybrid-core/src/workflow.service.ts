import { Injectable } from "@nestjs/common";

export interface WorkflowStatus {
  service: string;
  mode: string;
  status: string;
}

@Injectable()
export class WorkflowService {
  getStatus(): WorkflowStatus {
    return {
      service: "hybrid-core",
      mode: "phase1-scaffold",
      status: "ok"
    };
  }
}
