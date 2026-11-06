import { appConfig } from "./config.js";
import { createBotApp, registerBotCommands } from "./bot/handlers.js";
import { createSqliteDb } from "./services/sqlite-db.js";
import { HouseStore } from "./services/store.js";
import { IntervalScheduler } from "./services/scheduler.js";

async function main(): Promise<void> {
  if (appConfig.botPaused) {
    console.log("ShameBot in pausa: polling, scheduler e invii disattivati. I dati restano conservati.");
    return;
  }

  const store = new HouseStore(createSqliteDb(appConfig.databasePath));
  const { bot, send } = createBotApp({
    store,
    botToken: appConfig.botToken,
    siteUrl: appConfig.siteUrl,
    timezone: appConfig.defaultTimezone,
  });
  const scheduler = new IntervalScheduler(store, send, appConfig.schedulerIntervalMs, appConfig.defaultTimezone);

  const shutdown = () => {
    scheduler.stop();
    void bot.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  scheduler.start();
  await registerBotCommands(bot, { siteUrl: appConfig.siteUrl });
  await bot.start({
    onStart: (botInfo) => {
      console.log(`ShameBot online come @${botInfo.username}`);
      console.log(`Database: ${appConfig.databasePath}`);
    },
  });
}

main().catch((error) => {
  console.error("Avvio fallito:", error);
  process.exit(1);
});
