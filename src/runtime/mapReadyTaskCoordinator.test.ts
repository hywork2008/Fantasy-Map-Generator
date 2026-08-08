import { afterEach, describe, expect, it } from "vitest";
import {
  cancelMapReadyTasks,
  markMapReadyTasksAvailable,
  registerMapReadyTask,
  requestMapReadyTask
} from "./mapReadyTaskCoordinator";

const taskIds = ["test.map-ready.dependency", "test.map-ready.requested"];
const unregisterTask: Array<() => void> = [];

async function flushQueuedTasks(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
  cancelMapReadyTasks();
  for (const unregister of unregisterTask.splice(0)) unregister();
});

describe("map-ready task coordinator", () => {
  it("defers a live-toggle request until a complete map is available", async () => {
    const ran: string[] = [];
    unregisterTask.push(
      registerMapReadyTask({
        id: taskIds[0],
        label: "Dependency",
        run: () => ran.push("dependency")
      }),
      registerMapReadyTask({
        id: taskIds[1],
        label: "Requested",
        dependsOn: [taskIds[0]],
        run: () => ran.push("requested")
      })
    );

    requestMapReadyTask(taskIds[1]);
    await flushQueuedTasks();
    expect(ran).toEqual([]);

    markMapReadyTasksAvailable();
    requestMapReadyTask(taskIds[1]);
    await flushQueuedTasks();
    expect(ran).toEqual(["dependency", "requested"]);
  });
});
