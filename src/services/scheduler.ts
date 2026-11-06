import type { HouseStore } from "./store.js";
import { getDueNotice } from "./policy.js";
import { noticeMessage, safeSend, type SendToChat } from "./notify.js";

/**
 * Controlla tutte le attivita' e scrive nel gruppo della casa i promemoria e i solleciti dovuti.
 * Per ogni attivita' parte al massimo un messaggio per volta: le fasi saltate (es. dopo uno stop del bot)
 * vengono segnate come gestite senza essere inviate, cosi' non c'e' spam.
 */
export async function runDueChecks(store: HouseStore, send: SendToChat, now: Date = new Date()): Promise<number> {
  const tasks = await store.listTasksWithHouses();
  let sent = 0;

  for (const task of tasks) {
    const due = getDueNotice(task, now);
    if (!due) {
      continue;
    }

    const delivered = await safeSend(send, task.house.chatId, noticeMessage(task, due.send.key, now));
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
        await runDueChecks(this.store, this.send);
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
