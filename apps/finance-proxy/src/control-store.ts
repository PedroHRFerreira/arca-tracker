import { applyControlCommand, ControlCommandSchema, ControlStateSchema, createControlState, type ControlCommand, type ControlState } from '@arca/domain';

export class ControlError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export const CONTROL_OWNER = 'personal';

export async function readControlState(db: D1Database): Promise<ControlState> {
  const initial = createControlState();
  await db.prepare('INSERT OR IGNORE INTO control_state(owner, revision, state_json, updated_at) VALUES (?, ?, ?, ?)')
    .bind(CONTROL_OWNER, initial.revision, JSON.stringify(initial), initial.updatedAt).run();
  const row = await db.prepare('SELECT state_json FROM control_state WHERE owner = ?').bind(CONTROL_OWNER).first<{ state_json: string }>();
  if (!row) throw new ControlError('CONTROL_UNAVAILABLE', 503);
  return ControlStateSchema.parse(JSON.parse(row.state_json));
}

/** One compare-and-swap and its audit entry commit together. A stale writer never wins silently. */
export async function commitControlCommand(db: D1Database, input: ControlCommand): Promise<ControlState> {
  const command = ControlCommandSchema.parse(input);
  const encoded = JSON.stringify(command);
  const previous = await db.prepare('SELECT command_json FROM control_commands WHERE id = ?').bind(command.id).first<{ command_json: string }>();
  if (previous) {
    if (previous.command_json !== encoded) throw new ControlError('COMMAND_ID_REUSED', 409);
    return readControlState(db);
  }
  const state = await readControlState(db);
  if (state.revision !== command.baseRevision) throw new ControlError('REVISION_CONFLICT', 409);
  const next = applyControlCommand(state, command);
  const result = await db.batch([
    db.prepare('UPDATE control_state SET revision = ?, state_json = ?, last_command_id = ?, updated_at = ? WHERE owner = ? AND revision = ?')
      .bind(next.revision, JSON.stringify(next), command.id, next.updatedAt, CONTROL_OWNER, state.revision),
    db.prepare('INSERT OR IGNORE INTO control_commands(id, revision, command_json, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM control_state WHERE owner = ? AND last_command_id = ?)')
      .bind(command.id, next.revision, encoded, new Date().toISOString(), CONTROL_OWNER, command.id),
  ]);
  if (!result[0]?.meta.changes) {
    const applied = await db.prepare('SELECT command_json FROM control_commands WHERE id = ?').bind(command.id).first<{ command_json: string }>();
    if (applied?.command_json === encoded) return readControlState(db);
    throw new ControlError('REVISION_CONFLICT', 409);
  }
  return next;
}

export async function hashControlToken(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function issueControlToken(db: D1Database, purpose: 'PAIR' | 'CONFIRM', payload: unknown, minutes = 10): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
  await db.prepare('INSERT INTO control_tokens(token_hash, purpose, payload_json, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hashControlToken(token), purpose, JSON.stringify(payload), expiresAt).run();
  return { token, expiresAt };
}

export async function consumeControlToken<T>(db: D1Database, token: string, purpose: string): Promise<T | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const row = await db.prepare('UPDATE control_tokens SET consumed_at = ? WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ? RETURNING payload_json')
    .bind(new Date().toISOString(), await hashControlToken(token), purpose, new Date().toISOString()).first<{ payload_json: string }>();
  return row ? JSON.parse(row.payload_json) as T : null;
}

export type DiscordConnection = { user_id: string; channel_id: string; linked_at: string; delivery_error: string | null };
export async function readDiscordConnection(db: D1Database): Promise<DiscordConnection | null> {
  return db.prepare('SELECT user_id, channel_id, linked_at, delivery_error FROM discord_connection WHERE owner = ?').bind(CONTROL_OWNER).first<DiscordConnection>();
}
