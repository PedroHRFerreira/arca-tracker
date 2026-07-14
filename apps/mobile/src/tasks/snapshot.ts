import { calculatePortfolio } from "@arca/domain";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import {
  getTargets,
  loadPositions,
  migrateDatabase,
  saveDailySnapshot,
} from "@/db/database";

const SNAPSHOT_TASK = "arca-daily-snapshot";

TaskManager.defineTask(SNAPSHOT_TASK, async () => {
  try {
    await migrateDatabase();
    const positions = await loadPositions();
    const targets = await getTargets();
    const portfolio = calculatePortfolio(positions, targets);
    await saveDailySnapshot(portfolio.totalValue, portfolio.allocations);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn("Falha no snapshot em background", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerSnapshotTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(SNAPSHOT_TASK);
  if (!registered)
    await BackgroundTask.registerTaskAsync(SNAPSHOT_TASK, {
      minimumInterval: 720,
    });
}
