import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPlanningProfile, createControlState, ControlBillSchema, ControlCardSchema, ControlPaymentSchema } from "@arca/domain";

const state = vi.hoisted(() => ({
  granted: true,
  records: [] as Array<{
    identifier: string;
    content: { title: string; data?: Record<string, unknown> };
    trigger: unknown;
  }>,
  settings: new Map<string, string>(),
  platform: { OS: "android" },
}));
vi.mock("react-native", () => ({ Platform: state.platform }));
vi.mock("expo-constants", () => ({
  default: { executionEnvironment: "standalone" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));
vi.mock("@/db/database", () => ({
  getSetting: async (key: string) => state.settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => {
    state.settings.set(key, value);
  },
}));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ granted: state.granted })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: state.granted })),
  getAllScheduledNotificationsAsync: vi.fn(async () => [...state.records]),
  setNotificationChannelAsync: vi.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: {
    MONTHLY: "monthly",
    WEEKLY: "weekly",
    DATE: "date",
  },
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    state.records = state.records.filter((record) => record.identifier !== id);
  }),
  scheduleNotificationAsync: vi.fn(
    async (record: (typeof state.records)[number]) => {
      state.records.push(record);
      return record.identifier;
    },
  ),
}));
import {
  configureReminders,
  getReminderPreferences,
  enableControlBillReminders,
  refreshControlReminders,
} from "../src/notifications";
import * as N from "expo-notifications";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 10));
  vi.clearAllMocks();
  state.records = [];
  state.settings.clear();
  state.granted = true;
  state.platform.OS = "android";
});

describe('financial reminders preserve existing features', () => {
  function financialState() {
    const value = createControlState('2026-01-01T10:00:00Z');
    value.settings.alerts.bills = true;
    value.cards.push(ControlCardSchema.parse({ id: 'synthetic-card', name: 'Cartão de teste' }));
    value.bills.push(ControlBillSchema.parse({ id: 'synthetic-bill', cardId: 'synthetic-card', month: '2026-01', totalCents: 12000, dueDate: '2026-01-10', verification: 'CONFIRMED' }));
    return value;
  }
  it('schedules once, then cancels only paid bill reminders', async () => {
    const value = financialState();
    await configureReminders({ contribution: false, review: true, history: true });
    await refreshControlReminders(value); await refreshControlReminders(value);
    expect(state.records).toHaveLength(6);
    value.payments.push(ControlPaymentSchema.parse({ id: 'paid', billId: 'synthetic-bill', amountCents: 12000, paidDate: '2026-01-01', confirmed: true, affectsCash: false }));
    await refreshControlReminders(value);
    expect(state.records.map(row => row.identifier).sort()).toEqual(['arca-history', 'arca-review']);
  });
  it('requests permission only on explicit activation, with denial non-blocking', async () => {
    const value = financialState(); state.granted = false;
    expect(await refreshControlReminders(value)).toBe(false);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await enableControlBillReminders(value)).toBe(false);
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(state.records).toEqual([]);
  });
  it('never schedules unverified historical bill payment status', async () => {
    const value = financialState(); value.bills[0]!.paymentStatusKnown = false;
    await refreshControlReminders(value);
    expect(state.records).toEqual([]);
  });
  it('keeps the legacy contribution preference without scheduling a disabled financial contribution', async () => {
    const value = financialState();
    state.settings.set('control_bundle_v1', JSON.stringify({ state: value }));
    await configureReminders({ contribution: true, review: true, history: true }, defaultPlanningProfile());
    expect(state.records.map(row => row.identifier).sort()).toEqual(['arca-history', 'arca-review']);
    expect((await getReminderPreferences()).contribution).toBe(true);
  });
});

describe("independent local reminders", () => {
  it("reconciles idempotently and leaves unrelated notifications untouched", async () => {
    state.records.push({
      identifier: "other",
      content: { title: "Outro recurso" },
      trigger: null,
    });
    const prefs = { contribution: false, review: true, history: true };
    await configureReminders(prefs);
    await configureReminders(prefs);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    await configureReminders({ ...prefs, review: false });
    expect(state.records.map((record) => record.identifier).sort()).toEqual([
      "arca-history",
      "other",
    ]);
  });
  it("keeps a denied permission non-blocking and never requests it during background reconciliation", async () => {
    state.granted = false;
    expect(
      await configureReminders(
        { contribution: true, review: true, history: true },
        defaultPlanningProfile(),
        false,
      ),
    ).toEqual({ contribution: false, review: false, history: false });
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(state.records).toHaveLength(0);
  });
  it("schedules clamped monthly dates without changing their original anchor", async () => {
    const profile = {
      ...defaultPlanningProfile(),
      firstContributionDate: "2026-01-31",
    };
    await configureReminders(
      { contribution: true, review: false, history: false },
      profile,
    );
    expect(
      state.records.slice(0, 3).map((record) => record.identifier),
    ).toEqual([
      "arca-contribution-2026-01-31",
      "arca-contribution-2026-02-28",
      "arca-contribution-2026-03-31",
    ]);
    expect(
      state.records.every(
        (record) => (record.trigger as { date: Date }).date.getHours() === 9,
      ),
    ).toBe(true);
  });
  it("adopts legacy settings and removes only recognized legacy reminders", async () => {
    state.settings.set("notifications_enabled", "true");
    expect(await getReminderPreferences()).toEqual({
      contribution: false,
      review: true,
      history: true,
    });
    state.records = [
      {
        identifier: "legacy",
        content: { title: "Atualizar histórico" },
        trigger: null,
      },
      { identifier: "other", content: { title: "Outra coisa" }, trigger: null },
    ];
    await configureReminders({
      contribution: false,
      review: true,
      history: true,
    });
    expect(state.records.map((record) => record.identifier).sort()).toEqual([
      "arca-history",
      "arca-review",
      "other",
    ]);
  });
  it("refreshes the finite contribution window and caps the native pending queue", async () => {
    const profile = {
      ...defaultPlanningProfile(),
      firstContributionDate: "2026-01-01",
      frequency: "WEEKLY" as const,
    };
    const prefs = { contribution: true, review: true, history: true };
    await configureReminders(prefs, profile);
    expect(state.records).toHaveLength(26);
    vi.setSystemTime(new Date(2026, 3, 1, 10));
    await configureReminders(prefs, profile);
    expect(state.records).toHaveLength(26);
    expect(
      state.records.some(
        (record) => record.identifier === "arca-contribution-2026-01-08",
      ),
    ).toBe(false);
    expect(
      state.records.some((record) => record.identifier === "arca-history"),
    ).toBe(true);
  });
});
