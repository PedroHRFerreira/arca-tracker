import { ControlCommandSchema, ControlStateSchema, applyControlCommand, createControlState, type ControlCommand, type ControlState } from '@arca/domain';
import * as Crypto from 'expo-crypto';
import { getSetting, setSetting, migrateDatabase, restoreDatabaseJson } from './database';

export type ControlMutation = ControlCommand extends infer C ? C extends ControlCommand ? Omit<C, 'id' | 'baseRevision' | 'createdAt'> : never : never;
export type ControlBundle = {
  state: ControlState; base: ControlState; pending: ControlCommand[];
  conflict: ControlState | null; lastSyncAt: string | null; restorePending: boolean;
};
const key = 'control_bundle_v1';
let serial: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export function subscribeControl(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function withControlLock<T>(operation: () => Promise<T>): Promise<T> {
  const task = serial.then(operation, operation); serial = task.catch(() => undefined); return task;
}
export async function restoreLocalBackup(value: unknown): Promise<void> {
  await withControlLock(async () => {
    await restoreDatabaseJson(value);
    listeners.forEach(listener => listener());
  });
}
export async function loadControlBundle(): Promise<ControlBundle> {
  await migrateDatabase();
  const raw = await getSetting(key);
  if (!raw) { const state = createControlState(); return { state, base: state, pending: [], conflict: null, lastSyncAt: null, restorePending: false }; }
  const input = JSON.parse(raw) as ControlBundle;
  return { state: ControlStateSchema.parse(input.state), base: ControlStateSchema.parse(input.base),
    pending: input.pending.map(command => ControlCommandSchema.parse(command)),
    conflict: input.conflict ? ControlStateSchema.parse(input.conflict) : null,
    lastSyncAt: input.lastSyncAt, restorePending: (await getSetting('control_restore_pending_v1')) === 'true' || input.restorePending,
  };
}
export async function saveControlBundle(bundle: ControlBundle): Promise<void> {
  ControlStateSchema.parse(bundle.state); ControlStateSchema.parse(bundle.base);
  await setSetting(key, JSON.stringify(bundle));
  listeners.forEach(listener => listener());
}
export async function dispatchControlCommand(mutation: ControlMutation): Promise<ControlState> {
  return withControlLock(async () => {
    const bundle = await loadControlBundle();
    const command = ControlCommandSchema.parse({ ...mutation, id: Crypto.randomUUID(), baseRevision: bundle.state.revision, createdAt: new Date().toISOString() });
    const state = applyControlCommand(bundle.state, command);
    await saveControlBundle({ ...bundle, state, pending: [...bundle.pending, command] });
    return state;
  });
}
