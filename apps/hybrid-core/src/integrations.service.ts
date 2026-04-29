import { Injectable } from "@nestjs/common";

export interface IntegrationTargets {
  ollamaHost: string;
  hermesHost: string;
}

@Injectable()
export class IntegrationsService {
  getTargets(): IntegrationTargets {
    return {
      ollamaHost: process.env.OLLAMA_HOST ?? "http://ollama:11434",
      hermesHost: process.env.HERMES_HOST ?? "http://hermes:8080"
    };
  }
}
