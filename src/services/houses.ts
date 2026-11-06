import type { AppUser, House, Task, TaskSeverity } from "../types/domain.js";
import type { AssignmentInput, HouseStore, TaskUpdateInput } from "./store.js";
import {
  safeSend,
  taskCompletedMessage,
  taskCreatedMessage,
  taskDeletedMessage,
  taskRestoredMessage,
  taskUpdatedMessage,
  type SendToChat,
} from "./notify.js";

export type ChangeOptions = {
  /** Se true/false forza l'avviso al gruppo; se omesso vale l'impostazione della casa. */
  notify?: boolean;
};

/** Operazioni sulle attivita' di una casa: salvano, scrivono nel registro e (se richiesto) avvisano il gruppo. */
export class HouseService {
  constructor(
    private readonly store: HouseStore,
    private readonly send: SendToChat,
  ) {}

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
