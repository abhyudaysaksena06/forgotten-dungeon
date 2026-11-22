import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Secrets live only in server/.env (git-ignored) or the host's environment — never in the client.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const int = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== undefined ? Number(value) : fallback);

export const config = {
  port: int(env.PORT, 3001),
  clientOrigin: env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  dungeonSeed: env.DUNGEON_SEED ?? 'forgotten-dungeon-2026',
  voteSeconds: int(env.VOTE_SECONDS, 30),
  actionSeconds: int(env.ACTION_SECONDS, 30),
  npcSeconds: int(env.NPC_SECONDS, 2),
  speedTargetMinutes: int(env.SPEED_TARGET_MINUTES, 30),
  eventMinutes: int(env.EVENT_MINUTES, 90),
  // Quest: team profile file(s) and where autosaves go.
  questTeams: env.QUEST_TEAMS ?? fileURLToPath(new URL('../teams/profile.json', import.meta.url)),
  questSaves: env.QUEST_SAVES ?? fileURLToPath(new URL('../saves', import.meta.url)),
  dm: {
    provider: env.DM_PROVIDER ?? 'scripted', // 'scripted' | 'anthropic'
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.DM_MODEL ?? 'claude-haiku-5-5',
    timeoutMs: int(env.DM_TIMEOUT_MS, 8000),
  },
  // No default admin password: if unset, a random one is generated and printed at startup.
  adminToken: env.ADMIN_TOKEN || randomBytes(12).toString('base64url'),
  adminTokenGenerated: !env.ADMIN_TOKEN,
};
