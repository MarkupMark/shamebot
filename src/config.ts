import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { isBotPaused } from "./utils/paused.js";

loadEnv();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/shamebot.db"),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  DEFAULT_TIMEZONE: z.string().default("Europe/Rome"),
  BOT_USERNAME: z.string().default("vergognati_bot"),
  SITE_URL: z.string().url().default("https://shame.polipres.workers.dev"),
  BOT_PAUSED: z.string().default("false"),
});

const env = envSchema.parse(process.env);

export const appConfig = {
  botToken: env.BOT_TOKEN,
  databasePath: env.DATABASE_PATH,
  schedulerIntervalMs: env.SCHEDULER_INTERVAL_MS,
  defaultTimezone: env.DEFAULT_TIMEZONE,
  botUsername: env.BOT_USERNAME,
  siteUrl: env.SITE_URL,
  botPaused: isBotPaused(env.BOT_PAUSED),
} as const;
