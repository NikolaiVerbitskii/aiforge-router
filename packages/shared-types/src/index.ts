export type TaskType =
  | "autocomplete"
  | "refactor"
  | "explain"
  | "test"
  | "debug"
  | "architecture";

export interface TaskInput {
  task: string;
  files?: string[];
  context?: string;
}
