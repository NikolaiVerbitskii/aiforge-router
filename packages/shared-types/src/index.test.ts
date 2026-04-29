import { describe, expect, it } from "vitest";
import type { TaskInput, TaskType } from "./index";

describe("shared types", () => {
  it("accepts supported task type values", () => {
    const taskType: TaskType = "refactor";
    expect(taskType).toBe("refactor");
  });

  it("allows minimal task input", () => {
    const input: TaskInput = { task: "test task" };
    expect(input.task).toBe("test task");
  });
});
