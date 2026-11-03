CREATE TABLE IF NOT EXISTS control_state (
  owner TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  last_command_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS control_commands (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  command_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS control_tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS discord_connection (
  owner TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  delivery_error TEXT
);
CREATE TABLE IF NOT EXISTS control_deliveries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS control_bank_cache (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS control_bank_decisions (
  id TEXT PRIMARY KEY,
  decision_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
