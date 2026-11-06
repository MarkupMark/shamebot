import type { Absence, AppUser, House, MovedTask, Task, TaskSeverity } from "../types/domain.js";
import type { AssignmentInput, HouseStore, TaskUpdateInput } from "./store.js";
import {
  awayApprovedMessage,
  awayEndedMessage,
  awayRequestedMessage,
  sendAndGetId,
  safeSend,
  taskCompletedMessage,
  taskCreatedMessage,
  taskDeletedMessage,
  taskRestoredMessage,
  taskUpdatedMessage,
  type SendToChat,
} from "./notify.js";

/** Modifica il testo di un messaggio gia' inviato (e ne toglie i pulsanti). */
export type EditInChat = (chatId: number, messageId: number, text: string) => Promise<unknown>;

/** Errore "di regola" sulle assenze, da mostrare cosi' com'e' all'utente. */
export class AbsenceError extends Error {}

export type ChangeOptions = {
  /** Se true/false forza l'avviso al gruppo; se omesso vale l'impostazione della casa. */
  notify?: boolean;
};

/** Operazioni sulle attivita' di una casa: salvano, scrivono nel registro e (se richiesto) avvisano il gruppo. */
export class HouseService {
  constructor(
    private readonly store: HouseStore,
    private readonly send: SendToChat,
    private readonly edit: EditInChat = async () => undefined,
  ) {}

  // ---- Fuori casa ----

  /** "Sono fuori casa": crea la richiesta e chiede nel gruppo l'ok di un coinquilino (pulsante Confermo). */
  async requestAbsence(house: House, actor: AppUser): Promise<Absence> {
    const { absence, created } = await this.store.requestAbsence(house.id, actor.id);
    if (created) {
      const messageId = await sendAndGetId(this.send, house.chatId, awayRequestedMessage(actor.displayName), [
        [{ text: "✅ Confermo", data: `away:${absence.id}` }],
      ]);
      if (typeof messageId === "number") {
        await this.store.setAbsenceMessage(absence.id, messageId);
      }
    }
    return absence;
  }

  /** Un altro coinquilino conferma l'assenza: da ora le attivita' di chi e' fuori sono in pausa. */
  async approveAbsence(house: House, actor: AppUser, absenceId: number): Promise<Absence> {
    const absence = await this.store.getAbsence(house.id, absenceId);
    if (!absence || absence.status !== "pending") {
      throw new AbsenceError(absence?.status === "active" ? "Gia' confermata." : "Richiesta non trovata.");
    }
    if (absence.userId === actor.id) {
      throw new AbsenceError("Deve confermarlo un altro coinquilino.");
    }

    const approved = (await this.store.approveAbsence(house.id, absenceId, actor.id)) as Absence;
    const text = awayApprovedMessage(approved.userName, actor.displayName);
    const edited = approved.messageId !== null && (await this.tryEdit(house.chatId, approved.messageId, text));
    if (!edited) {
      await safeSend(this.send, house.chatId, text);
    }
    return approved;
  }

  /** Annulla una richiesta non ancora confermata (solo chi l'ha fatta). */
  async cancelAbsence(house: House, actor: AppUser, absenceId: number): Promise<void> {
    const absence = await this.store.getAbsence(house.id, absenceId);
    if (!absence || absence.status !== "pending") {
      throw new AbsenceError("Si puo' annullare solo una richiesta non ancora confermata.");
    }
    if (absence.userId !== actor.id) {
      throw new AbsenceError("Puo' annullarla solo chi l'ha fatta.");
    }
    await this.store.cancelAbsence(house.id, absenceId);
    if (absence.messageId !== null) {
      await this.tryEdit(house.chatId, absence.messageId, `🧳 ${absence.userName}: richiesta annullata`);
    }
  }

  /** Rientro (lo segna chi rientra o un altro coinquilino): sposta le scadenze e lo scrive nel gruppo. */
  async endAbsence(house: House, actor: AppUser, absenceId: number, timezone: string): Promise<{ absence: Absence; moved: MovedTask[] }> {
    const now = new Date();
    const result = await this.store.endAbsence(house.id, absenceId, actor.id, now, timezone);
    if (!result) {
      throw new AbsenceError("Nessuna assenza in corso da chiudere.");
    }
    const by = result.absence.userId === actor.id ? null : actor.displayName;
    await safeSend(this.send, house.chatId, awayEndedMessage(result.absence.userName, by, result.moved, now));
    return result;
  }

  private async tryEdit(chatId: number, messageId: number, text: string): Promise<boolean> {
    try {
      await this.edit(chatId, messageId, text);
      return true;
    } catch (error) {
      console.error("Modifica messaggio fallita:", error);
      return false;
    }
  }

  private shouldNotify(house: House, options: ChangeOptions): boolean {
    return options.notify ?? house.notifyChanges;
  }

  async createTask(
    house: House,
    actor: AppUser,
    input: { name: string; intervalMs: number; severity: TaskSeverity; assignment?: AssignmentInput },
    options: ChangeOptions = {},
  ): Promise<{ task: Task; notified: boolean }> {
    const task = await this.store.createTask(
      house.id,
      actor.id,
      input.name,
      input.intervalMs,
      input.severity,
      new Date(),
      null,
      input.assignment ?? null,
    );
    const notified = this.shouldNotify(house, options)
      ? await safeSend(this.send, house.chatId, taskCreatedMessage(actor.displayName, task))
      : false;
    return { task, notified };
  }

  async updateTask(
    house: House,
    actor: AppUser,
    taskId: number,
    updates: TaskUpdateInput,
    options: ChangeOptions = {},
  ): Promise<{ task: Task; changes: string[]; notified: boolean } | null> {
    const result = await this.store.updateTask(house.id, taskId, actor.id, updates);
    if (!result) {
      return null;
    }

    const notified =
      result.changes.length > 0 && this.shouldNotify(house, options)
        ? await safeSend(this.send, house.chatId, taskUpdatedMessage(actor.displayName, result.task, result.changes))
        : false;
    return { task: result.task, changes: result.changes, notified };
  }

  async deleteTask(house: House, actor: AppUser, taskId: number, options: ChangeOptions = {}): Promise<{ task: Task; notified: boolean } | null> {
    const task = await this.store.deleteTask(house.id, taskId, actor.id);
    if (!task) {
      return null;
    }

    const notified = this.shouldNotify(house, options)
      ? await safeSend(this.send, house.chatId, taskDeletedMessage(actor.displayName, task))
      : false;
    return { task, notified };
  }

  /** Ricrea un'attivita' eliminata a partire da una voce del registro. */
  async restoreTask(house: House, actor: AppUser, logId: number, options: ChangeOptions = {}): Promise<{ task: Task; notified: boolean } | null> {
    const task = await this.store.restoreTask(house.id, logId, actor.id);
    if (!task) {
      return null;
    }

    const notified = this.shouldNotify(house, options)
      ? await safeSend(this.send, house.chatId, taskRestoredMessage(actor.displayName, task))
      : false;
    return { task, notified };
  }

  /** Segna come fatta. `announce` = scrive l'annuncio nel gruppo (il bot in gruppo risponde da solo, il portale no). */
  async completeTask(house: House, actor: AppUser, taskId: number, announce: boolean): Promise<Task | null> {
    const task = await this.store.completeTask(house.id, taskId, actor.id, new Date());
    if (task && announce) {
      await safeSend(this.send, house.chatId, taskCompletedMessage(actor.displayName, task));
    }
    return task;
  }
}
