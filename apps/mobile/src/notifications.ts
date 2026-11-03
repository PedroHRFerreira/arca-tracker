import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import {
  contributionDates,
  localDateString,
  type PlanningProfile,
  type ControlState,
  controlBillPaidCents,
  getControlAlerts,
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
  const controlRaw = await getSetting('control_bundle_v1');
  if (controlRaw) {
    try {
      const control = JSON.parse(controlRaw).state as ControlState;
      const initialized = control.accounts.length + control.incomes.length + control.expenses.length + control.cards.length > 0;
      if (initialized) profile = control.settings.activeContributionCents > 0 && profile
        ? { ...profile, contributionAmount: (control.settings.activeContributionCents / 100).toFixed(2), frequency: 'MONTHLY' }
        : null;
    } catch { profile = null; }
  }
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

export function enableControlBillReminders(state: ControlState): Promise<boolean> {
  return serialize(() => reconcileControlReminders(state, true));
}
export function refreshControlReminders(state: ControlState): Promise<boolean> {
  return serialize(() => reconcileControlReminders(state, false));
}
async function reconcileControlReminders(state: ControlState, requestPermission: boolean): Promise<boolean> {
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  const N = await import('expo-notifications');
  const wants = Object.entries(state.settings.alerts).some(([key, value]) => key !== 'hour' && key !== 'discord' && value === true);
  let permission = await N.getPermissionsAsync();
  if (wants && !permission.granted && requestPermission) permission = await N.requestPermissionsAsync();
  if (Platform.OS === 'android') await N.setNotificationChannelAsync('arca-finances', { name: 'Seu controle financeiro', importance: N.AndroidImportance.DEFAULT });
  const now = new Date();
  const desired: Array<{ identifier: string; title: string; body: string; date: Date }> = [];
  if (permission.granted && state.settings.alerts.bills) for (const bill of state.bills.filter(row => !row.cancelled && row.verification === 'CONFIRMED' && row.paymentStatusKnown)) {
    const outstanding = Math.max(0, bill.totalCents - controlBillPaidCents(state, bill.id, localDateString()));
    if (!outstanding) continue;
    for (const days of [7, 3, 1, 0]) {
      const at = new Date(`${bill.dueDate}T${String(state.settings.alerts.hour).padStart(2, '0')}:00:00`);
      at.setDate(at.getDate() - days);
      if (at <= now) continue;
      desired.push({ identifier: `arca-finance-bill:${bill.id}:${bill.dueDate}:${days}`, title: days ? `Fatura vence em ${days} dia${days === 1 ? '' : 's'}` : 'Fatura vence hoje',
        body: `${state.cards.find(row => row.id === bill.cardId)?.name ?? 'Cartão'}: confira o valor restante no ARCA antes de pagar.`, date: at });
    }
  }
  desired.sort((a, b) => a.date.getTime() - b.date.getTime());
  const rolling = desired.slice(0, 36);
  const fingerprint = JSON.stringify(rolling.map(row => ({ ...row, date: row.date.toISOString() })));
  const scheduled = (await N.getAllScheduledNotificationsAsync()).filter(row => row.content.data?.arcaReminder === 'finance-bills');
  if (scheduled.length !== rolling.length || scheduled.some(row => row.content.data?.fingerprint !== fingerprint)) {
    for (const row of scheduled) await N.cancelScheduledNotificationAsync(row.identifier);
    for (const row of rolling) await N.scheduleNotificationAsync({ identifier: row.identifier, content: { title: row.title, body: row.body, data: { arcaReminder: 'finance-bills', fingerprint } }, trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: row.date, channelId: 'arca-finances' } });
  }
  if (permission.granted) for (const alert of getControlAlerts(state, localDateString()).filter(row => !row.key.startsWith('bill:'))) {
    const deliveredKey = `control_notification:${alert.key}`;
    if (await getSetting(deliveredKey)) continue;
    await N.scheduleNotificationAsync({ identifier: `arca-finance-${alert.key}`, content: { title: alert.title, body: alert.body, data: { arcaReminder: 'finance-budget' } }, trigger: null });
    await setSetting(deliveredKey, new Date().toISOString());
  }
  return permission.granted;
}
