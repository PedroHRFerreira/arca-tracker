import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import {
  contributionDates,
  localDateString,
  type PlanningProfile,
} from "@arca/domain";
import { getSetting, setSetting } from "@/db/database";

export interface ReminderPreferences {
  contribution: boolean;
  review: boolean;
  history: boolean;
}
export const noReminders: ReminderPreferences = {
  contribution: false,
  review: false,
  history: false,
};
type Kind = keyof ReminderPreferences;
const kinds: Kind[] = ["contribution", "review", "history"];

export async function getReminderPreferences(): Promise<ReminderPreferences> {
  const legacy = (await getSetting("notifications_enabled")) === "true";
  const result = { ...noReminders };
  for (const kind of kinds) {
    const value = await getSetting(`reminder_${kind}`);
    result[kind] =
      value === null ? kind !== "contribution" && legacy : value === "true";
  }
  return result;
}

let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

export function configureReminders(
  preferences: ReminderPreferences,
  profile: PlanningProfile | null = null,
  requestPermission = true,
): Promise<ReminderPreferences> {
  return serialize(() =>
    reconcileReminders(preferences, profile, requestPermission),
  );
}

/** Read saved preferences inside the queue so returning from a permission dialog cannot overwrite a toggle. */
export function refreshScheduledReminders(
  profile: PlanningProfile | null,
): Promise<ReminderPreferences> {
  return serialize(async () =>
    reconcileReminders(await getReminderPreferences(), profile, false),
  );
}

/** Reconcile only this app's changed reminder groups. Refresh rolling dates on app open. */
async function reconcileReminders(
  preferences: ReminderPreferences,
  profile: PlanningProfile | null = null,
  requestPermission = true,
): Promise<ReminderPreferences> {
  const supported =
    Platform.OS !== "web" &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  const result = { ...preferences };
  if (!supported) return { ...noReminders };
  const N = await import("expo-notifications");
  const wantsAny = kinds.some((kind) => preferences[kind]);
  let permission = await N.getPermissionsAsync();
  if (wantsAny && !permission.granted && requestPermission)
    permission = await N.requestPermissionsAsync();
  if (!permission.granted) for (const kind of kinds) result[kind] = false;
  if (Platform.OS === "android")
    await N.setNotificationChannelAsync("arca-reminders", {
      name: "Seu planejamento",
      importance: N.AndroidImportance.DEFAULT,
    });
  const scheduled = await N.getAllScheduledNotificationsAsync();
  // Adopt the two legacy reminders once, without touching unrelated notifications.
  for (const entry of scheduled) {
    if (
      !entry.content.data?.arcaReminder &&
      ["Revisar carteira ARCA", "Atualizar histórico"].includes(
        entry.content.title ?? "",
      )
    ) {
      await N.cancelScheduledNotificationAsync(entry.identifier);
    }
  }
  for (const kind of kinds) {
    const now = new Date();
    const desired: Array<{
      identifier: string;
      title: string;
      body: string;
      trigger: Parameters<typeof N.scheduleNotificationAsync>[0]["trigger"];
    }> = [];
    if (result[kind]) {
      if (kind === "review")
        desired.push({
          identifier: "arca-review",
          title: "Como está seu plano?",
          body: "Confira suas metas e o próximo passo da carteira.",
          trigger: {
            type: N.SchedulableTriggerInputTypes.MONTHLY,
            day: 1,
            hour: 9,
            minute: 0,
            channelId: "arca-reminders",
          },
        });
      if (kind === "history")
        desired.push({
          identifier: "arca-history",
          title: "Sua evolução da semana",
          body: "Abra o ARCA para atualizar os valores e acompanhar seu progresso.",
          trigger: {
            type: N.SchedulableTriggerInputTypes.WEEKLY,
            weekday: 1,
            hour: 18,
            minute: 0,
            channelId: "arca-reminders",
          },
        });
      if (kind === "contribution" && profile) {
        const end = new Date(
          now.getFullYear() + 1,
          now.getMonth(),
          now.getDate(),
        );
        for (const date of contributionDates(
          profile.firstContributionDate,
          profile.frequency,
          localDateString(end),
        )) {
          const at = new Date(`${date}T09:00:00`);
          if (at <= now) continue;
          desired.push({
            identifier: `arca-contribution-${date}`,
            title: "Hora de cuidar do seu plano",
            body: "Veja o destino do próximo aporte e registre quando realizar.",
            trigger: {
              type: N.SchedulableTriggerInputTypes.DATE,
              date: at,
              channelId: "arca-reminders",
            },
          });
          if (desired.length === 24) break;
        }
      }
    }
    const fingerprint = JSON.stringify(desired);
    const current = scheduled.filter(
      (entry) => entry.content.data?.arcaReminder === kind,
    );
    if (
      current.length === desired.length &&
      current.every((entry) => entry.content.data?.fingerprint === fingerprint)
    )
      continue;
    for (const entry of current)
      await N.cancelScheduledNotificationAsync(entry.identifier);
    for (const entry of desired)
      await N.scheduleNotificationAsync({
        identifier: entry.identifier,
        content: {
          title: entry.title,
          body: entry.body,
          data: { arcaReminder: kind, fingerprint },
        },
        trigger: entry.trigger,
      });
  }
  for (const kind of kinds)
    await setSetting(`reminder_${kind}`, String(result[kind]));
  return result;
}

/** Legacy callers retain review/history switches until migrated. */
export async function configureLocalReminders(
  enabled: boolean,
): Promise<boolean> {
  const result = await configureReminders({
    contribution: false,
    review: enabled,
    history: enabled,
  });
  return result.review || result.history;
}
