import Constants, { ExecutionEnvironment } from "expo-constants";

export async function configureLocalReminders(
  enabled: boolean,
): Promise<boolean> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  const Notifications = await import("expo-notifications");
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return false;
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Revisar carteira ARCA",
      body: "Confira o drift dos quadrantes e registre seus aportes.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: 1,
      hour: 9,
      minute: 0,
    },
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Atualizar histórico",
      body: "Abra o ARCA Tracker para sincronizar cotações e registrar o snapshot.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 18,
      minute: 0,
    },
  });
  return true;
}
