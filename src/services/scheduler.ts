import { awayKey, type HouseStore } from "./store.js";
import { getDueNotice } from "./policy.js";
import { noticeMessage, safeSend, type SendToChat } from "./notify.js";
import { runDigests } from "./digest.js";
import { defaultInsults, fillInsult, randomPick, type Chooser } from "./insults.js";

/**
 * Controlla tutte le attivita' e scrive nel gruppo della casa i promemoria e i solleciti dovuti.
 * Per ogni attivita' parte al massimo un messaggio per volta: le fasi saltate (es. dopo uno stop del bot)
 * vengono segnate come gestite senza essere inviate, cosi' non c'e' spam.
 */
export async function runDueChecks(
  store: HouseStore,
  send: SendToChat,
  now: Date = new Date(),
  pick: Chooser = randomPick,
): Promise<number> {
  // Scadenze vecchie (di prima dei periodi fissi): si allineano alla fine del loro periodo.
  await store.alignDeadlinesToPeriods(now);
  const tasks = await store.listTasksWithHouses();
  const away = await store.listAwayUsers();
  let sent = 0;

  for (const task of tasks) {
    // Chi e' fuori casa (assenza confermata) non riceve avvisi ne' insulti: le sue attivita' sono in pausa.
    if (task.assigneeId !== null && away.has(awayKey(task.house.id, task.assigneeId))) {
      continue;
    }

    const due = getDueNotice(task, now, store.timezone);
    if (!due) {
      continue;
    }

    let text = noticeMessage(task, due.send.key, now);
    // Scadenza e sollecito sono "infrazioni": il bot aggiunge un insulto a caso tra quelli scritti dagli altri
    // coinquilini (mai da chi lo riceve); se non ce ne sono usa i predefiniti.
    if (due.send.key === "overdue" || due.send.key === "nudge") {
      const pool = await store.insultPool(task.house.id, task.severity, task.assigneeId);
      const template = pick(pool.length ? pool : defaultInsults[task.severity]);
      if (template) {
        text += `\n${fillInsult(template, task)}`;
      }
    }

    const delivered = await safeSend(send, task.house.chatId, text);
    if (delivered) {
      await store.markNoticesHandled(task.id, due.markAsHandled, now);
      sent += 1;
    }
  }

  return sent;
}

export class IntervalScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly store: HouseStore,
    private readonly send: SendToChat,
    private readonly intervalMs: number,
    private readonly timezone: string = "Europe/Rome",
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    const tick = async () => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        const now = new Date();
        await runDueChecks(this.store, this.send, now);
        await runDigests(this.store, this.send, now, this.timezone);
      } catch (error) {
        console.error("Scheduler fallito:", error);
      } finally {
        this.running = false;
      }
    };

    void tick();
    this.timer = setInterval(() => void tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
