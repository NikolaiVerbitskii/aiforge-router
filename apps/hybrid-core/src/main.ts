import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 4111);
  await app.listen(port, "0.0.0.0");
  return app;
}

if (require.main === module) {
  void bootstrap();
}
