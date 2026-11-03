import { discordCommands, discordConfigured, type DiscordConfig } from './control-discord';
import { ControlError, hashControlToken } from './control-store';

async function fingerprint(env: DiscordConfig) {
  return hashControlToken(`${env.DISCORD_APPLICATION_ID}:${env.DISCORD_PUBLIC_KEY}:${env.DISCORD_BOT_TOKEN}`);
}
export async function discordReady(env: DiscordConfig): Promise<boolean> {
  if (!discordConfigured(env) || !env.DB) return false;
  const row = await env.DB.prepare("SELECT value FROM control_configuration WHERE key='discord_validated'").first<{ value: string }>();
  return row?.value === await fingerprint(env);
}
export async function configureDiscord(env: DiscordConfig): Promise<void> {
  if (!discordConfigured(env) || !env.DB) throw new ControlError('DISCORD_NOT_CONFIGURED', 503);
  const response = await fetch('https://discord.com/api/v10/applications/@me', { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (!response.ok) { await response.body?.cancel(); throw new ControlError('DISCORD_CREDENTIALS_INVALID'); }
  const application = await response.json() as { id?: string; verify_key?: string };
  if (application.id !== env.DISCORD_APPLICATION_ID || application.verify_key?.toLowerCase() !== env.DISCORD_PUBLIC_KEY?.toLowerCase()) throw new ControlError('DISCORD_APPLICATION_MISMATCH');
  const registration = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`, { method: 'PUT', headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(discordCommands), redirect: 'manual', signal: AbortSignal.timeout(12000) });
  if (!registration.ok) { await registration.body?.cancel(); throw new ControlError('DISCORD_COMMAND_REGISTRATION_FAILED'); }
  await registration.body?.cancel();
  await env.DB.prepare("INSERT INTO control_configuration(key,value) VALUES('discord_validated',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await fingerprint(env)).run();
}
