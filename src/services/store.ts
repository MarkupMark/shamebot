import type {
  Absence,
  AbsenceStatus,
  TurnSwap,
  TurnSwapStatus,
  MovedTask,
  AppUser,
  DigestKind,
  DigestSettings,
  AssignMode,
  SlotKind,
  TaskSlot,
  House,
  HouseMember,
  LogEntry,
  LogKind,
  NoticeStageKey,
  Task,
  TaskSeverity,
  TaskWithHouse,
  WebLoginRequest,
} from "../types/domain.js";
import type { Db, SqlParam, SqlRow } from "./db.js";
import { describeTaskChanges } from "../utils/tasks.js";
import { buildNoticeStages, getDueAt } from "./policy.js";
import { endOfLocalDay } from "./digest.js";

export type TelegramIdentity = {
  telegramId: number;
  username: string | null;
  displayName: string;
};

export type SlotInput = {
  userId: number;
  kind: SlotKind;
  startsAt: string;
  dueAt: string;
};

export type AssignmentInput = {
  mode: AssignMode;
  /** 'single': [id]; 'alternate': ordine dei turni (almeno 2). Ignorato per 'anyone' e 'custom'. */
  userIds?: number[];
  /** Solo 'custom': sostituisce i turni ancora aperti (quelli gia' fatti restano nello storico). */
  slots?: SlotInput[];
};

export type TaskUpdateInput = {
  name?: string;
  intervalMs?: number;
  severity?: TaskSeverity;
  assignment?: AssignmentInput;
};

export const digestDefaults: Record<DigestKind, Omit<DigestSettings, "kind" | "lastSentDate">> = {
  morning: { enabled: true, time: "09:00", intro: null, skipIfEmpty: true },
  evening: { enabled: false, time: "21:00", intro: null, skipIfEmpty: true },
};

export type DigestUpdate = Partial<Pick<DigestSettings, "enabled" | "time" | "intro" | "skipIfEmpty">>;

export type HouseSetup = {
  house: House;
  created: boolean;
  adoptedTasks: number;
};

export type TaskUpdateResult = {
  before: Task;
  task: Task;
  changes: string[];
};

const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

/**
 * Colonne e join comuni per leggere un'attivita' con l'assegnatario corrente:
 * - custom: l'utente del turno aperto con la scadenza piu' vicina (che decide anche la scadenza);
 * - single: il primo (unico) utente della lista;
 * - alternate: l'utente di turno secondo assign_turn.
 */
const taskColumns = `
  t.*, u.display_name AS last_completed_by_name,
  s.starts_at AS slot_starts_at, s.due_at AS slot_due_at,
  au.id AS assignee_id, au.display_name AS assignee_name
`;

const taskJoins = `
  LEFT JOIN users u ON u.id = t.last_completed_by
  LEFT JOIN task_slots s ON t.assign_mode = 'custom' AND s.id = (
    SELECT id FROM task_slots WHERE task_id = t.id AND completed_at IS NULL ORDER BY due_at, id LIMIT 1
  )
  LEFT JOIN users au ON au.id = CASE t.assign_mode
    WHEN 'custom' THEN s.user_id
    WHEN 'single' THEN json_extract(t.assign_users, '$[0]')
    WHEN 'alternate' THEN json_extract(t.assign_users, '$[' || (t.assign_turn % MAX(json_array_length(t.assign_users), 1)) || ']')
  END
`;

const taskSelect = `SELECT ${taskColumns} FROM tasks t ${taskJoins}`;

const logSelect = `
  SELECT l.*, COALESCE(u.display_name, 'Qualcuno') AS user_name,
    CASE WHEN l.kind IN ('created', 'deleted') AND l.restored_at IS NULL AND l.task_id IS NOT NULL
              AND l.task_interval_ms IS NOT NULL AND l.task_severity IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = l.task_id)
         THEN 1 ELSE 0 END AS restorable
  FROM house_log l LEFT JOIN users u ON u.id = l.user_id
`;

export class HouseStore {
  constructor(private readonly db: Db) {}

  // ---- Utenti ----

  async upsertUser(identity: TelegramIdentity): Promise<AppUser> {
    const now = new Date().toISOString();
    const byTelegram = await this.db.first("SELECT * FROM users WHERE telegram_id = ?", [identity.telegramId]);
    if (byTelegram) {
      await this.db.run(
        "UPDATE users SET username = ?, display_name = ?, updated_at = ? WHERE id = ?",
        [identity.username, identity.displayName, now, Number(byTelegram.id)],
      );
      return (await this.getUserById(Number(byTelegram.id))) as AppUser;
    }

    await this.db.run(
      "INSERT INTO users (telegram_id, username, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [identity.telegramId, identity.username, identity.displayName, now, now],
    );
    return (await this.getUserByTelegramId(identity.telegramId)) as AppUser;
  }

  async getUserById(id: number): Promise<AppUser | null> {
    const row = await this.db.first("SELECT * FROM users WHERE id = ?", [id]);
    return row ? mapUser(row) : null;
  }

  async getUserByTelegramId(telegramId: number): Promise<AppUser | null> {
    const row = await this.db.first("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);
    return row ? mapUser(row) : null;
  }

  // ---- Case e membri ----

  /**
   * Crea la casa per un gruppo Telegram (o la restituisce se esiste gia').
   * La prima casa creata adotta le attivita' preesistenti senza casa, facendole ripartire da adesso.
   */
  async getOrCreateHouse(chatId: number, name: string, createdBy: number, now: Date = new Date()): Promise<HouseSetup> {
    const existing = await this.getHouseByChatId(chatId);
    if (existing) {
      return { house: existing, created: false, adoptedTasks: 0 };
    }

    const iso = now.toISOString();
    const result = await this.db.run(
      "INSERT INTO houses (name, chat_id, notify_changes, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)",
      [name, chatId, createdBy, iso, iso],
    );
    const houseId = result.lastRowId;

    const adopted = await this.db.run(
      `UPDATE tasks
       SET house_id = ?, cycle_anchor_at = ?, reminder_three_hours_sent_at = NULL, reminder_thirty_minutes_sent_at = NULL,
           overdue_notice_sent_at = NULL, nudge_sent_at = NULL, updated_at = ?
       WHERE house_id IS NULL`,
      [houseId, iso, iso],
    );

    return {
      house: (await this.getHouse(houseId)) as House,
      created: true,
      adoptedTasks: adopted.changes,
    };
  }

  async getHouse(id: number): Promise<House | null> {
    const row = await this.db.first("SELECT * FROM houses WHERE id = ?", [id]);
    return row ? mapHouse(row) : null;
  }

  async getHouseByChatId(chatId: number): Promise<House | null> {
    const row = await this.db.first("SELECT * FROM houses WHERE chat_id = ?", [chatId]);
    return row ? mapHouse(row) : null;
  }

  async listHousesForUser(userId: number): Promise<House[]> {
    const rows = await this.db.all(
      `SELECT h.* FROM houses h
       JOIN house_members m ON m.house_id = h.id
       WHERE m.user_id = ?
       ORDER BY h.name COLLATE NOCASE`,
      [userId],
    );
    return rows.map(mapHouse);
  }

  async listHouses(): Promise<House[]> {
    const rows = await this.db.all("SELECT * FROM houses ORDER BY id");
    return rows.map(mapHouse);
  }

  // ---- Fuori casa ----

  /** Assenze in attesa di conferma o in corso. */
  async listOpenAbsences(houseId: number): Promise<Absence[]> {
    const rows = await this.db.all(`${absenceSelect} WHERE a.house_id = ? AND a.status IN ('pending', 'active') ORDER BY a.starts_at`, [houseId]);
    return rows.map(mapAbsence);
  }

  async getAbsence(houseId: number, absenceId: number): Promise<Absence | null> {
    const row = await this.db.first(`${absenceSelect} WHERE a.house_id = ? AND a.id = ?`, [houseId, absenceId]);
    return row ? mapAbsence(row) : null;
  }

  /** Coinquilini fuori casa (assenza confermata) per ogni casa: le loro attivita' sono in pausa. */
  async listAwayUsers(): Promise<Set<string>> {
    const rows = await this.db.all("SELECT house_id, user_id FROM absences WHERE status = 'active'");
    return new Set(rows.map((row) => awayKey(Number(row.house_id), Number(row.user_id))));
  }

  async awayUserIds(houseId: number): Promise<Set<number>> {
    const rows = await this.db.all("SELECT user_id FROM absences WHERE house_id = ? AND status = 'active'", [houseId]);
    return new Set(rows.map((row) => Number(row.user_id)));
  }

  /** "Sono fuori casa": se ce n'e' gia' una aperta per lo stesso utente restituisce quella. */
  async requestAbsence(houseId: number, userId: number, now: Date = new Date()): Promise<{ absence: Absence; created: boolean }> {
    const open = (await this.listOpenAbsences(houseId)).find((absence) => absence.userId === userId);
    if (open) {
      return { absence: open, created: false };
    }
    const result = await this.db.run(
      "INSERT INTO absences (house_id, user_id, status, starts_at) VALUES (?, ?, 'pending', ?)",
      [houseId, userId, now.toISOString()],
    );
    return { absence: (await this.getAbsence(houseId, result.lastRowId)) as Absence, created: true };
  }

  async setAbsenceMessage(absenceId: number, messageId: number): Promise<void> {
    await this.db.run("UPDATE absences SET message_id = ? WHERE id = ?", [messageId, absenceId]);
  }

  async approveAbsence(houseId: number, absenceId: number, approverId: number, now: Date = new Date()): Promise<Absence | null> {
    const result = await this.db.run(
      "UPDATE absences SET status = 'active', approved_by = ?, approved_at = ? WHERE house_id = ? AND id = ? AND status = 'pending' AND user_id <> ?",
      [approverId, now.toISOString(), houseId, absenceId, approverId],
    );
    return result.changes > 0 ? await this.getAbsence(houseId, absenceId) : null;
  }

  async cancelAbsence(houseId: number, absenceId: number, now: Date = new Date()): Promise<boolean> {
    const result = await this.db.run(
      "UPDATE absences SET status = 'cancelled', ended_at = ? WHERE house_id = ? AND id = ? AND status = 'pending'",
      [now.toISOString(), houseId, absenceId],
    );
    return result.changes > 0;
  }

  /**
   * Rientro: chiude l'assenza e sposta le scadenze delle attivita' assegnate a chi rientra.
   * - scadute durante l'assenza -> vanno fatte entro la fine del giorno del rientro;
   * - non ancora scadute -> slittano di quanto e' durata l'assenza (giorni "regalati");
   * - gia' in ritardo prima di partire -> restano come sono.
   */
  async endAbsence(
    houseId: number,
    absenceId: number,
    endedBy: number,
    now: Date,
    timezone: string,
  ): Promise<{ absence: Absence; moved: MovedTask[] } | null> {
    const absence = await this.getAbsence(houseId, absenceId);
    if (!absence || absence.status !== "active") {
      return null;
    }
    await this.db.run("UPDATE absences SET status = 'ended', ended_by = ?, ended_at = ? WHERE id = ?", [endedBy, now.toISOString(), absenceId]);

    const start = new Date(absence.startsAt);
    const awayMs = Math.max(0, now.getTime() - start.getTime());
    const endOfToday = endOfLocalDay(now, timezone);
    const moved: MovedTask[] = [];

    for (const task of await this.listTasks(houseId)) {
      if (task.assigneeId !== absence.userId) {
        continue;
      }
      const due = getDueAt(task);
      if (due < start) {
        continue;
      }
      const overdue = due < now;
      const newDue = overdue ? endOfToday : new Date(due.getTime() + awayMs);

      if (task.slotDueAt) {
        await this.db.run(
          `UPDATE task_slots SET due_at = ?
           WHERE id = (SELECT id FROM task_slots WHERE task_id = ? AND completed_at IS NULL ORDER BY due_at, id LIMIT 1)`,
          [newDue.toISOString(), task.id],
        );
      } else {
        await this.db.run("UPDATE tasks SET cycle_anchor_at = ? WHERE id = ?", [
          new Date(newDue.getTime() - task.intervalMs).toISOString(),
          task.id,
        ]);
      }
      await this.db.run(
        `UPDATE tasks SET reminder_three_hours_sent_at = NULL, reminder_thirty_minutes_sent_at = NULL,
           overdue_notice_sent_at = NULL, nudge_sent_at = NULL, updated_at = ? WHERE id = ?`,
        [now.toISOString(), task.id],
      );
      moved.push({ task: (await this.getTask(houseId, task.id)) as Task, dueAt: newDue, overdue, shiftMs: overdue ? 0 : awayMs });
    }

    return { absence: (await this.getAbsence(houseId, absenceId)) as Absence, moved };
  }

  // ---- Scambi di turno ----

  /** Richieste di scambio in attesa (quelle di attivita' eliminate non compaiono). */
  async listPendingSwaps(houseId: number): Promise<TurnSwap[]> {
    const rows = await this.db.all(`${swapSelect} WHERE w.house_id = ? AND w.status = 'pending' ORDER BY w.id`, [houseId]);
    return rows.map(mapSwap);
  }

  async getSwap(houseId: number, swapId: number): Promise<TurnSwap | null> {
    const row = await this.db.first(`${swapSelect} WHERE w.house_id = ? AND w.id = ?`, [houseId, swapId]);
    return row ? mapSwap(row) : null;
  }

  async createSwap(houseId: number, taskId: number, requesterId: number, targetId: number, now: Date = new Date()): Promise<TurnSwap> {
    const result = await this.db.run(
      "INSERT INTO turn_swaps (house_id, task_id, requester_id, target_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      [houseId, taskId, requesterId, targetId, now.toISOString()],
    );
    return (await this.getSwap(houseId, result.lastRowId)) as TurnSwap;
  }

  async setSwapMessage(swapId: number, messageId: number): Promise<void> {
    await this.db.run("UPDATE turn_swaps SET message_id = ? WHERE id = ?", [messageId, swapId]);
  }

  /** Chiude una richiesta ancora in attesa; false se nel frattempo era gia' stata chiusa. */
  async resolveSwap(houseId: number, swapId: number, status: Exclude<TurnSwapStatus, "pending">, now: Date = new Date()): Promise<boolean> {
    const result = await this.db.run(
      "UPDATE turn_swaps SET status = ?, resolved_at = ? WHERE house_id = ? AND id = ? AND status = 'pending'",
      [status, now.toISOString(), houseId, swapId],
    );
    return result.changes > 0;
  }

  /**
   * Inverte le posizioni di due coinquilini nella rotazione di un'attivita' "a turno", senza toccare il
   * contatore del turno: se toccava a uno dei due, ora tocca all'altro. null se non e' (piu') possibile.
   */
  async swapRotation(houseId: number, taskId: number, userA: number, userB: number, actorId: number, now: Date = new Date()): Promise<Task | null> {
    const task = await this.getTask(houseId, taskId);
    if (!task || task.assignMode !== "alternate") {
      return null;
    }
    const ids = task.assignUserIds.slice();
    const a = ids.indexOf(userA);
    const b = ids.indexOf(userB);
    if (a < 0 || b < 0 || a === b) {
      return null;
    }
    [ids[a], ids[b]] = [ids[b] as number, ids[a] as number];
    await this.db.run(
      `UPDATE tasks SET assign_users = ?, reminder_three_hours_sent_at = NULL, reminder_thirty_minutes_sent_at = NULL, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(ids), now.toISOString(), taskId],
    );
    const names = await Promise.all([userA, userB].map(async (id) => (await this.getUserById(id))?.displayName ?? "?"));
    await this.addLog(houseId, actorId, taskId, task.name, "updated", `turno scambiato: ${names[0]} ↔ ${names[1]}`, now);
    return this.getTask(houseId, taskId);
  }

  /**
   * Centro di comando: sposta la scadenza delle attivita' indicate di `shiftMs` (negativo = anticipa).
   * Per le attivita' a turni personalizzati si spostano tutti i turni aperti. I promemoria gia' inviati
   * ripartono da zero. Restituisce le attivita' aggiornate (ignora gli id che non sono della casa).
   */
  async shiftTaskDeadlines(houseId: number, userId: number, taskIds: number[], shiftMs: number, now: Date): Promise<Task[]> {
    const wanted = new Set(taskIds);
    const shifted: Task[] = [];
    const days = Math.round(shiftMs / 86_400_000);
    const detail = `scadenza ${days > 0 ? "posticipata" : "anticipata"} di ${Math.abs(days)} ${Math.abs(days) === 1 ? "giorno" : "giorni"}`;

    for (const task of await this.listTasks(houseId)) {
      if (!wanted.has(task.id)) {
        continue;
      }
      if (task.assignMode === "custom") {
        const open = (await this.listOpenSlots(houseId)).filter((slot) => slot.taskId === task.id);
        for (const slot of open) {
          await this.db.run("UPDATE task_slots SET starts_at = ?, due_at = ? WHERE id = ?", [
            new Date(new Date(slot.startsAt).getTime() + shiftMs).toISOString(),
            new Date(new Date(slot.dueAt).getTime() + shiftMs).toISOString(),
            slot.id,
          ]);
        }
      }
      if (task.assignMode !== "custom" || !task.slotDueAt) {
        await this.db.run("UPDATE tasks SET cycle_anchor_at = ? WHERE id = ?", [
          new Date(new Date(task.cycleAnchorAt).getTime() + shiftMs).toISOString(),
          task.id,
        ]);
      }
      await this.db.run(
        `UPDATE tasks SET reminder_three_hours_sent_at = NULL, reminder_thirty_minutes_sent_at = NULL,
           overdue_notice_sent_at = NULL, nudge_sent_at = NULL, updated_at = ? WHERE id = ?`,
        [now.toISOString(), task.id],
      );
      await this.addLog(houseId, userId, task.id, task.name, "updated", detail, now);
      shifted.push((await this.getTask(houseId, task.id)) as Task);
    }

    return shifted;
  }

  // ---- Insulti ----

  /** Gli insulti scritti da un coinquilino, per gravita'. Sono segreti: si mostrano solo al loro autore. */
  async listMyInsults(houseId: number, authorId: number): Promise<Record<TaskSeverity, string[]>> {
    const rows = await this.db.all(
      "SELECT severity, text FROM insults WHERE house_id = ? AND author_id = ? ORDER BY id",
      [houseId, authorId],
    );
    const result: Record<TaskSeverity, string[]> = { low: [], medium: [], high: [] };
    for (const row of rows) {
      result[String(row.severity) as TaskSeverity].push(String(row.text));
    }
    return result;
  }

  /** Quanti insulti ha scritto in totale la casa per ogni gravita' (solo il numero, non il testo). */
  async countInsults(houseId: number): Promise<Record<TaskSeverity, number>> {
    const rows = await this.db.all("SELECT severity, COUNT(*) AS n FROM insults WHERE house_id = ? GROUP BY severity", [houseId]);
    const result: Record<TaskSeverity, number> = { low: 0, medium: 0, high: 0 };
    for (const row of rows) {
      result[String(row.severity) as TaskSeverity] = Number(row.n);
    }
    return result;
  }

  /** Sostituisce gli insulti di un autore per una gravita' (lista vuota = li cancella). */
  async setMyInsults(houseId: number, authorId: number, severity: TaskSeverity, messages: string[]): Promise<void> {
    await this.db.run("DELETE FROM insults WHERE house_id = ? AND author_id = ? AND severity = ?", [houseId, authorId, severity]);
    const now = new Date().toISOString();
    for (const text of messages) {
      await this.db.run(
        "INSERT INTO insults (house_id, author_id, severity, text, created_at) VALUES (?, ?, ?, ?, ?)",
        [houseId, authorId, severity, text, now],
      );
    }
  }

  /** Insulti utilizzabili contro `targetId`: quelli degli altri coinquilini (mai i suoi contro se stesso). */
  async insultPool(houseId: number, severity: TaskSeverity, targetId: number | null): Promise<string[]> {
    const rows = await this.db.all(
      "SELECT text FROM insults WHERE house_id = ? AND severity = ? AND (? IS NULL OR author_id <> ?)",
      [houseId, severity, targetId, targetId],
    );
    return rows.map((row) => String(row.text));
  }

  // ---- Promemoria giornalieri ----

  /** Impostazioni di buongiorno e serale, con i valori predefiniti dove la casa non ha scelto. */
  async getDigests(houseId: number): Promise<Record<DigestKind, DigestSettings>> {
    const rows = await this.db.all("SELECT * FROM house_digests WHERE house_id = ?", [houseId]);
    const result = {} as Record<DigestKind, DigestSettings>;
    for (const kind of ["morning", "evening"] as const) {
      const row = rows.find((r) => r.kind === kind);
      result[kind] = row
        ? {
            kind,
            enabled: Number(row.enabled) === 1,
            time: String(row.send_time),
            intro: nullableString(row.intro),
            skipIfEmpty: Number(row.skip_if_empty) === 1,
            lastSentDate: nullableString(row.last_sent_date),
          }
        : { kind, ...digestDefaults[kind], lastSentDate: null };
    }
    return result;
  }

  async updateDigest(houseId: number, kind: DigestKind, update: DigestUpdate): Promise<DigestSettings> {
    const current = (await this.getDigests(houseId))[kind];
    const next = { ...current, ...update };
    await this.upsertDigest(houseId, next);
    return next;
  }

  /** Segna il giorno locale come gestito (inviato o saltato perche' vuoto/in ritardo). */
  async markDigestHandled(houseId: number, kind: DigestKind, localDate: string): Promise<void> {
    const current = (await this.getDigests(houseId))[kind];
    await this.upsertDigest(houseId, { ...current, lastSentDate: localDate });
  }

  private async upsertDigest(houseId: number, settings: DigestSettings): Promise<void> {
    await this.db.run(
      `INSERT INTO house_digests (house_id, kind, enabled, send_time, intro, skip_if_empty, last_sent_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (house_id, kind) DO UPDATE SET
         enabled = excluded.enabled, send_time = excluded.send_time, intro = excluded.intro,
         skip_if_empty = excluded.skip_if_empty, last_sent_date = excluded.last_sent_date, updated_at = excluded.updated_at`,
      [
        houseId,
        settings.kind,
        settings.enabled ? 1 : 0,
        settings.time,
        settings.intro,
        settings.skipIfEmpty ? 1 : 0,
        settings.lastSentDate,
        new Date().toISOString(),
      ],
    );
  }

  async setHouseNotifyChanges(houseId: number, notifyChanges: boolean): Promise<void> {
    await this.db.run("UPDATE houses SET notify_changes = ?, updated_at = ? WHERE id = ?", [
      notifyChanges ? 1 : 0,
      new Date().toISOString(),
      houseId,
    ]);
  }

  async renameHouse(houseId: number, name: string): Promise<void> {
    await this.db.run("UPDATE houses SET name = ?, updated_at = ? WHERE id = ?", [name, new Date().toISOString(), houseId]);
  }

  async addMember(houseId: number, userId: number): Promise<boolean> {
    const result = await this.db.run(
      "INSERT OR IGNORE INTO house_members (house_id, user_id, joined_at) VALUES (?, ?, ?)",
      [houseId, userId, new Date().toISOString()],
    );
    return result.changes > 0;
  }

  async isMember(houseId: number, userId: number): Promise<boolean> {
    const row = await this.db.first("SELECT 1 AS ok FROM house_members WHERE house_id = ? AND user_id = ?", [houseId, userId]);
    return Boolean(row);
  }

  async listMembers(houseId: number): Promise<HouseMember[]> {
    const rows = await this.db.all(
      `SELECT u.id AS user_id, u.display_name, u.username, m.joined_at
       FROM house_members m JOIN users u ON u.id = m.user_id
       WHERE m.house_id = ?
       ORDER BY m.joined_at`,
      [houseId],
    );
    return rows.map((row) => ({
      userId: Number(row.user_id),
      displayName: String(row.display_name),
      username: row.username ? String(row.username) : null,
      joinedAt: String(row.joined_at),
    }));
  }

  // ---- Attivita' ----

  async createTask(
    houseId: number,
    userId: number,
    name: string,
    intervalMs: number,
    severity: TaskSeverity,
    now: Date = new Date(),
    detail: string | null = null,
    assignment: AssignmentInput | null = null,
  ): Promise<Task> {
    const iso = now.toISOString();
    const result = await this.db.run(
      `INSERT INTO tasks (owner_id, house_id, name, interval_ms, severity, cycle_anchor_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, houseId, name, intervalMs, severity, iso, iso, iso],
    );
    if (assignment && assignment.mode !== "anyone") {
      await this.saveAssignment(result.lastRowId, assignment, now);
    }
    const task = (await this.getTask(houseId, result.lastRowId)) as Task;
    await this.addLog(houseId, userId, task.id, task.name, "created", detail, now, task);
    return task;
  }

  /** Turni personalizzati ancora da fare, per tutte le attivita' della casa, in ordine di scadenza. */
  async listOpenSlots(houseId: number): Promise<TaskSlot[]> {
    const rows = await this.db.all(
      `SELECT s.*, u.display_name AS user_name
       FROM task_slots s
       JOIN tasks t ON t.id = s.task_id
       JOIN users u ON u.id = s.user_id
       WHERE t.house_id = ? AND s.completed_at IS NULL
       ORDER BY s.due_at, s.id`,
      [houseId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      taskId: Number(row.task_id),
      userId: Number(row.user_id),
      userName: String(row.user_name),
      kind: String(row.kind) as SlotKind,
      startsAt: String(row.starts_at),
      dueAt: String(row.due_at),
    }));
  }

  /** Salva la modalita' di assegnazione; per 'custom' sostituisce i turni aperti. */
  private async saveAssignment(taskId: number, assignment: AssignmentInput, now: Date = new Date()): Promise<void> {
    const userIds = assignment.mode === "single" || assignment.mode === "alternate" ? (assignment.userIds ?? []) : [];
    const users = userIds.length ? JSON.stringify(userIds) : null;
    // Il turno corrente resta dov'e' se modalita' e utenti non cambiano (es. si modifica solo il nome).
    await this.db.run(
      `UPDATE tasks SET assign_mode = ?, assign_users = ?,
         assign_turn = CASE WHEN assign_mode = ? AND COALESCE(assign_users, '') = ? THEN assign_turn ELSE 0 END
       WHERE id = ?`,
      [assignment.mode, users, assignment.mode, users ?? "", taskId],
    );

    await this.db.run("DELETE FROM task_slots WHERE task_id = ? AND completed_at IS NULL", [taskId]);
    if (assignment.mode === "custom") {
      for (const slot of assignment.slots ?? []) {
        await this.db.run(
          "INSERT INTO task_slots (task_id, user_id, kind, starts_at, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [taskId, slot.userId, slot.kind, slot.startsAt, slot.dueAt, now.toISOString()],
        );
      }
    }
  }

  /** Descrizione breve dell'assegnazione, per registro e avvisi (es. "a turno: Luca, Anna"). */
  async describeAssignment(houseId: number, taskId: number): Promise<string> {
    const task = await this.getTask(houseId, taskId);
    if (!task) {
      return "";
    }
    const names = await this.userNames(task.assignUserIds);
    switch (task.assignMode) {
      case "anyone":
        return "chiunque";
      case "single":
        return `solo ${names[0] ?? "?"}`;
      case "alternate":
        return `a turno: ${names.join(", ")}`;
      case "custom": {
        const open = (await this.listOpenSlots(houseId)).filter((slot) => slot.taskId === taskId);
        return `personalizzata (${open.length} turn${open.length === 1 ? "o" : "i"})`;
      }
    }
  }

  private async slotSignature(houseId: number, taskId: number): Promise<string> {
    const open = (await this.listOpenSlots(houseId)).filter((slot) => slot.taskId === taskId);
    return JSON.stringify(open.map((slot) => [slot.userId, slot.kind, slot.startsAt, slot.dueAt]));
  }

  private async userNames(ids: number[]): Promise<string[]> {
    const names: string[] = [];
    for (const id of ids) {
      const user = await this.getUserById(id);
      names.push(user?.displayName ?? "?");
    }
    return names;
  }

  async listTasks(houseId: number): Promise<Task[]> {
    const rows = await this.db.all(`${taskSelect} WHERE t.house_id = ?`, [houseId]);
    return rows.map(mapTask);
  }

  async getTask(houseId: number, taskId: number): Promise<Task | null> {
    const row = await this.db.first(`${taskSelect} WHERE t.house_id = ? AND t.id = ?`, [houseId, taskId]);
    return row ? mapTask(row) : null;
  }

  /**
   * Modifica un'attivita'. Una modifica non deve mai far scattare un ritardo (e quindi un insulto):
   * - se si accorcia la frequenza la scadenza diventa la piu' vicina tra la vecchia e "adesso + nuova frequenza",
   *   cosi' nessuno risulta in ritardo per un ciclo che non conosceva; se si allunga resta "ultimo Fatto + frequenza";
   * - un'attivita' gia' in ritardo prima della modifica tiene la sua scadenza (il ritardo non si cancella ne' si ripete);
   * - gli avvisi gia' inviati restano inviati, quelli spostati nel futuro ripartono, e quelli che la modifica
   *   porterebbe nel passato vengono segnati come gestiti invece di partire subito.
   */
  async updateTask(
    houseId: number,
    taskId: number,
    userId: number,
    updates: TaskUpdateInput,
    now: Date = new Date(),
  ): Promise<TaskUpdateResult | null> {
    const before = await this.getTask(houseId, taskId);
    if (!before) {
      return null;
    }

    const name = updates.name ?? before.name;
    const intervalMs = updates.intervalMs ?? before.intervalMs;
    const severity = updates.severity ?? before.severity;
    const changes = describeTaskChanges(before, { name, intervalMs, severity });

    if (updates.assignment) {
      const beforeLabel = await this.describeAssignment(houseId, taskId);
      const beforeSlots = await this.slotSignature(houseId, taskId);
      await this.saveAssignment(taskId, updates.assignment);
      const afterLabel = await this.describeAssignment(houseId, taskId);
      if (beforeLabel !== afterLabel) {
        changes.push(`assegnazione ${beforeLabel} → ${afterLabel}`);
      } else if (beforeSlots !== (await this.slotSignature(houseId, taskId))) {
        changes.push("turni aggiornati");
      }
    }

    if (changes.length > 0) {
      const current = (await this.getTask(houseId, taskId)) as Task;
      const edited = { ...current, name, intervalMs, severity, cycleAnchorAt: before.cycleAnchorAt };
      const cycleAnchorAt = rescheduleAnchor(before, edited, now);
      const after = { ...edited, cycleAnchorAt };
      const flags = rescheduleNoticeFlags(before, after, now);
      await this.db.run(
        `UPDATE tasks
         SET name = ?, interval_ms = ?, severity = ?, cycle_anchor_at = ?, updated_at = ?,
             reminder_three_hours_sent_at = ?, reminder_thirty_minutes_sent_at = ?,
             overdue_notice_sent_at = ?, nudge_sent_at = ?
         WHERE id = ? AND house_id = ?`,
        [
          name,
          intervalMs,
          severity,
          cycleAnchorAt,
          now.toISOString(),
          flags.three_hours,
          flags.thirty_minutes,
          flags.overdue,
          flags.nudge,
          taskId,
          houseId,
        ],
      );
      await this.addLog(houseId, userId, taskId, name, "updated", changes.join("; "), now);
    }

    return { before, task: (await this.getTask(houseId, taskId)) as Task, changes };
  }

  /** Segna l'attivita' come fatta da userId e fa ripartire il ciclo. */
  async completeTask(houseId: number, taskId: number, userId: number, completedAt: Date): Promise<Task | null> {
    const task = await this.getTask(houseId, taskId);
    if (!task) {
      return null;
    }

    const iso = completedAt.toISOString();
    // Chiude il turno personalizzato corrente (chiunque l'abbia fatto) oppure passa il turno al prossimo.
    if (task.assignMode === "custom" && task.slotDueAt) {
      await this.db.run(
        `UPDATE task_slots SET completed_at = ?, completed_by = ?
         WHERE id = (SELECT id FROM task_slots WHERE task_id = ? AND completed_at IS NULL ORDER BY due_at, id LIMIT 1)`,
        [iso, userId, taskId],
      );
    }
    await this.db.run(
      `UPDATE tasks
       SET cycle_anchor_at = ?, last_completed_by = ?, completed_count = completed_count + 1, updated_at = ?,
           assign_turn = CASE WHEN assign_mode = 'alternate' THEN assign_turn + 1 ELSE assign_turn END,
           reminder_three_hours_sent_at = NULL, reminder_thirty_minutes_sent_at = NULL,
           overdue_notice_sent_at = NULL, nudge_sent_at = NULL
       WHERE id = ? AND house_id = ?`,
      [iso, userId, iso, taskId, houseId],
    );
    await this.addLog(houseId, userId, taskId, task.name, "done", null, completedAt);
    return await this.getTask(houseId, taskId);
  }

  async deleteTask(houseId: number, taskId: number, userId: number): Promise<Task | null> {
    const task = await this.getTask(houseId, taskId);
    if (!task) {
      return null;
    }

    // Righe storiche della v1 che puntano ancora all'attivita' (FK): vanno rimosse prima.
    await this.db.run("DELETE FROM task_completions WHERE task_id = ?", [taskId]);
    await this.db.run("DELETE FROM bonus_usages WHERE task_id = ?", [taskId]);
    await this.db.run("DELETE FROM task_slots WHERE task_id = ?", [taskId]);
    await this.db.run("DELETE FROM tasks WHERE id = ? AND house_id = ?", [taskId, houseId]);
    await this.addLog(houseId, userId, task.id, task.name, "deleted", null, new Date(), task);
    return task;
  }

  // ---- Registro ----

  async listLog(houseId: number, limit = 30): Promise<LogEntry[]> {
    const rows = await this.db.all(
      `${logSelect} WHERE l.house_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
      [houseId, limit],
    );
    return rows.map(mapLogEntry);
  }

  /**
   * Ricrea un'attivita' eliminata a partire da una voce del registro (aggiunta o eliminazione).
   * Il ciclo riparte da adesso. Restituisce null se la voce non esiste o non e' ripristinabile.
   */
  async restoreTask(houseId: number, logId: number, userId: number, now: Date = new Date()): Promise<Task | null> {
    const row = await this.db.first(`${logSelect} WHERE l.house_id = ? AND l.id = ?`, [houseId, logId]);
    if (!row || Number(row.restorable) !== 1) {
      return null;
    }

    const task = await this.createTask(
      houseId,
      userId,
      String(row.task_name),
      Number(row.task_interval_ms),
      String(row.task_severity) as TaskSeverity,
      now,
      "ripristinata",
    );
    await this.db.run("UPDATE house_log SET restored_at = ? WHERE house_id = ? AND task_id = ?", [
      now.toISOString(),
      houseId,
      Number(row.task_id),
    ]);
    return task;
  }

  private async addLog(
    houseId: number,
    userId: number | null,
    taskId: number | null,
    taskName: string,
    kind: LogKind,
    detail: string | null = null,
    at: Date = new Date(),
    snapshot: Pick<Task, "intervalMs" | "severity"> | null = null,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO house_log (house_id, user_id, task_id, task_name, kind, detail, created_at, task_interval_ms, task_severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [houseId, userId, taskId, taskName, kind, detail, at.toISOString(), snapshot?.intervalMs ?? null, snapshot?.severity ?? null],
    );
  }

  // ---- Scheduler ----

  async listTasksWithHouses(): Promise<TaskWithHouse[]> {
    const rows = await this.db.all(
      `SELECT ${taskColumns},
              h.id AS h_id, h.name AS h_name, h.chat_id AS h_chat_id, h.notify_changes AS h_notify_changes,
              h.created_by AS h_created_by, h.created_at AS h_created_at, h.updated_at AS h_updated_at
       FROM tasks t
       JOIN houses h ON h.id = t.house_id
       ${taskJoins}`,
    );

    return rows.map((row) => ({
      ...mapTask(row),
      house: {
        id: Number(row.h_id),
        name: String(row.h_name),
        chatId: Number(row.h_chat_id),
        notifyChanges: Number(row.h_notify_changes) === 1,
        createdBy: row.h_created_by === null ? null : Number(row.h_created_by),
        createdAt: String(row.h_created_at),
        updatedAt: String(row.h_updated_at),
      },
    }));
  }

  async markNoticesHandled(taskId: number, stages: NoticeStageKey[], at: Date): Promise<void> {
    const columns: Record<NoticeStageKey, string> = {
      three_hours: "reminder_three_hours_sent_at",
      thirty_minutes: "reminder_thirty_minutes_sent_at",
      overdue: "overdue_notice_sent_at",
      nudge: "nudge_sent_at",
    };

    if (stages.length === 0) {
      return;
    }

    const iso = at.toISOString();
    const assignments = stages.map((stage) => `${columns[stage]} = ?`).join(", ");
    await this.db.run(`UPDATE tasks SET ${assignments} WHERE id = ?`, [...stages.map(() => iso), taskId]);
  }

  // ---- Login web ----

  async createWebLoginRequest(expiresAt: Date): Promise<WebLoginRequest> {
    const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    // Codice di 6 cifre da scrivere al bot, unico tra le richieste ancora valide.
    let code = randomLoginCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const clash = await this.db.first(
        "SELECT token FROM web_login_requests WHERE code = ? AND status = 'pending' AND expires_at > ?",
        [code, now],
      );
      if (!clash) {
        break;
      }
      code = randomLoginCode();
    }
    await this.db.run(
      "INSERT INTO web_login_requests (token, code, status, created_at, expires_at) VALUES (?, ?, 'pending', ?, ?)",
      [token, code, now, expiresAt.toISOString()],
    );
    return (await this.getWebLoginRequest(token)) as WebLoginRequest;
  }

  async getWebLoginRequest(token: string): Promise<WebLoginRequest | null> {
    const row = await this.db.first("SELECT * FROM web_login_requests WHERE token = ?", [token]);
    if (!row) {
      return null;
    }

    const request = mapWebLoginRequest(row);
    if ((request.status === "pending" || request.status === "approved") && new Date(request.expiresAt) <= new Date()) {
      await this.db.run("UPDATE web_login_requests SET status = 'expired' WHERE token = ?", [token]);
      return { ...request, status: "expired" };
    }
    return request;
  }

  async approveWebLoginRequest(token: string, identity: TelegramIdentity, approvedAt: Date): Promise<WebLoginRequest | null> {
    const request = await this.getWebLoginRequest(token);
    if (!request || request.status !== "pending") {
      return request;
    }

    await this.db.run(
      "UPDATE web_login_requests SET status = 'approved', telegram_id = ?, username = ?, display_name = ?, approved_at = ? WHERE token = ?",
      [identity.telegramId, identity.username, identity.displayName, approvedAt.toISOString(), token],
    );
    return await this.getWebLoginRequest(token);
  }

  /** Conferma dal bot scrivendo il codice mostrato sul portale. null se nessuna richiesta valida ha quel codice. */
  async approveWebLoginRequestByCode(code: string, identity: TelegramIdentity, approvedAt: Date): Promise<WebLoginRequest | null> {
    const row = await this.db.first(
      "SELECT token FROM web_login_requests WHERE code = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
      [code, approvedAt.toISOString()],
    );
    return row ? await this.approveWebLoginRequest(String(row.token), identity, approvedAt) : null;
  }

  async claimWebLoginRequest(token: string, claimedAt: Date): Promise<WebLoginRequest | null> {
    const result = await this.db.run(
      "UPDATE web_login_requests SET status = 'claimed', claimed_at = ? WHERE token = ? AND status = 'approved'",
      [claimedAt.toISOString(), token],
    );
    return result.changes > 0 ? await this.getWebLoginRequest(token) : null;
  }

  // ---- Sessioni web ----

  async createWebSession(userId: number): Promise<string> {
    const sessionId = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
    const now = new Date();
    await this.db.run(
      "INSERT INTO web_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [sessionId, userId, now.toISOString(), new Date(now.getTime() + sessionTtlMs).toISOString()],
    );
    return sessionId;
  }

  async getUserBySession(sessionId: string): Promise<AppUser | null> {
    const row = await this.db.first(
      `SELECT u.* FROM web_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? LIMIT 1`,
      [sessionId, new Date().toISOString()],
    );
    return row ? mapUser(row) : null;
  }

  async destroyWebSession(sessionId: string): Promise<void> {
    await this.db.run("DELETE FROM web_sessions WHERE id = ?", [sessionId]);
  }

  async pruneExpired(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run("DELETE FROM web_sessions WHERE expires_at <= ?", [now]);
    await this.db.run(
      "DELETE FROM web_login_requests WHERE expires_at <= ? OR (status = 'claimed' AND claimed_at <= ?)",
      [now, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()],
    );
  }
}

export const sessionTtlSeconds = sessionTtlMs / 1000;

export function awayKey(houseId: number, userId: number): string {
  return `${houseId}:${userId}`;
}

const swapSelect = `
  SELECT w.*, t.name AS task_name, r.display_name AS requester_name, g.display_name AS target_name
  FROM turn_swaps w
  JOIN tasks t ON t.id = w.task_id
  JOIN users r ON r.id = w.requester_id
  JOIN users g ON g.id = w.target_id
`;

function mapSwap(row: SqlRow): TurnSwap {
  return {
    id: Number(row.id),
    houseId: Number(row.house_id),
    taskId: Number(row.task_id),
    taskName: String(row.task_name),
    requesterId: Number(row.requester_id),
    requesterName: String(row.requester_name),
    targetId: Number(row.target_id),
    targetName: String(row.target_name),
    status: String(row.status) as TurnSwapStatus,
    createdAt: String(row.created_at),
    messageId: row.message_id === null || row.message_id === undefined ? null : Number(row.message_id),
  };
}

const absenceSelect = `
  SELECT a.*, u.display_name AS user_name, ap.display_name AS approved_by_name
  FROM absences a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN users ap ON ap.id = a.approved_by
`;

function mapAbsence(row: SqlRow): Absence {
  return {
    id: Number(row.id),
    houseId: Number(row.house_id),
    userId: Number(row.user_id),
    userName: String(row.user_name),
    status: String(row.status) as AbsenceStatus,
    startsAt: String(row.starts_at),
    approvedBy: row.approved_by === null || row.approved_by === undefined ? null : Number(row.approved_by),
    approvedByName: nullableString(row.approved_by_name),
    endedAt: nullableString(row.ended_at),
    messageId: row.message_id === null || row.message_id === undefined ? null : Number(row.message_id),
  };
}

function mapUser(row: SqlRow): AppUser {
  return {
    id: Number(row.id),
    telegramId: Number(row.telegram_id),
    username: row.username ? String(row.username) : null,
    displayName: String(row.display_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHouse(row: SqlRow): House {
  return {
    id: Number(row.id),
    name: String(row.name),
    chatId: Number(row.chat_id),
    notifyChanges: Number(row.notify_changes) === 1,
    createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTask(row: SqlRow): Task {
  return {
    id: Number(row.id),
    houseId: row.house_id === null || row.house_id === undefined ? null : Number(row.house_id),
    createdBy: Number(row.owner_id),
    name: String(row.name),
    intervalMs: Number(row.interval_ms),
    severity: String(row.severity) as TaskSeverity,
    cycleAnchorAt: String(row.cycle_anchor_at),
    reminderThreeHoursSentAt: nullableString(row.reminder_three_hours_sent_at),
    reminderThirtyMinutesSentAt: nullableString(row.reminder_thirty_minutes_sent_at),
    overdueNoticeSentAt: nullableString(row.overdue_notice_sent_at),
    nudgeSentAt: nullableString(row.nudge_sent_at),
    lastCompletedBy: row.last_completed_by === null || row.last_completed_by === undefined ? null : Number(row.last_completed_by),
    lastCompletedByName: nullableString(row.last_completed_by_name),
    completedCount: Number(row.completed_count ?? 0),
    assignMode: (row.assign_mode ? String(row.assign_mode) : "anyone") as AssignMode,
    assignUserIds: parseIdList(row.assign_users),
    assignTurn: Number(row.assign_turn ?? 0),
    assigneeId: row.assignee_id === null || row.assignee_id === undefined ? null : Number(row.assignee_id),
    assigneeName: nullableString(row.assignee_name),
    slotStartsAt: nullableString(row.slot_starts_at),
    slotDueAt: nullableString(row.slot_due_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLogEntry(row: SqlRow): LogEntry {
  return {
    id: Number(row.id),
    houseId: Number(row.house_id),
    userId: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    userName: String(row.user_name),
    taskId: row.task_id === null || row.task_id === undefined ? null : Number(row.task_id),
    taskName: String(row.task_name),
    kind: String(row.kind) as LogKind,
    detail: nullableString(row.detail),
    restorable: Number(row.restorable ?? 0) === 1,
    createdAt: String(row.created_at),
  };
}

function randomLoginCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(value).padStart(6, "0");
}

function mapWebLoginRequest(row: SqlRow): WebLoginRequest {
  return {
    token: String(row.token),
    code: nullableString(row.code),
    status: String(row.status) as WebLoginRequest["status"],
    telegramId: row.telegram_id === null || row.telegram_id === undefined ? null : Number(row.telegram_id),
    username: nullableString(row.username),
    displayName: nullableString(row.display_name),
    approvedAt: nullableString(row.approved_at),
    claimedAt: nullableString(row.claimed_at),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  };
}

function parseIdList(value: unknown): number[] {
  if (typeof value !== "string" || !value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isSafeInteger(id)) : [];
  } catch {
    return [];
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export type { SqlParam };

/**
 * Nuovo inizio del ciclo dopo una modifica (vedi HouseStore.updateTask). `after` e' l'attivita' gia' modificata
 * ma con il vecchio cycle_anchor_at. Con un turno personalizzato aperto la scadenza e' quella del turno.
 */
function rescheduleAnchor(before: Task, after: Task, now: Date): string {
  if (after.slotDueAt) {
    return before.cycleAnchorAt;
  }
  const oldDue = getDueAt(before).getTime();
  const naiveDue = getDueAt(after).getTime();
  let newDue: number;
  if (naiveDue === oldDue || naiveDue > oldDue) {
    newDue = naiveDue; // stessa scadenza o piu' tardi: nessun problema
  } else if (oldDue <= now.getTime()) {
    newDue = oldDue; // gia' in ritardo: il ritardo resta quello che era
  } else {
    // Scadenza anticipata: al massimo un ciclo intero da adesso, mai oltre la vecchia scadenza.
    newDue = Math.min(oldDue, Math.max(naiveDue, now.getTime() + after.intervalMs));
  }
  return new Date(newDue - after.intervalMs).toISOString();
}

type NoticeFlags = Record<NoticeStageKey, string | null>;

/** Stato degli avvisi dopo una modifica: nessun avviso deve partire solo perche' l'attivita' e' stata modificata. */
function rescheduleNoticeFlags(before: Task, after: Task, now: Date): NoticeFlags {
  const sent: NoticeFlags = {
    three_hours: before.reminderThreeHoursSentAt,
    thirty_minutes: before.reminderThirtyMinutesSentAt,
    overdue: before.overdueNoticeSentAt,
    nudge: before.nudgeSentAt,
  };
  const oldAt = new Map(buildNoticeStages(before).map((stage) => [stage.key, stage.at.getTime()]));
  const result: NoticeFlags = { three_hours: null, thirty_minutes: null, overdue: null, nudge: null };
  for (const stage of buildNoticeStages(after)) {
    if (stage.at.getTime() > now.getTime()) {
      continue; // nel futuro: partira' a tempo debito
    }
    const wasAlreadyDue = (oldAt.get(stage.key) ?? Infinity) <= now.getTime();
    // Gia' dovuto prima della modifica: resta com'era (inviato o in attesa dello scheduler).
    // Diventato dovuto per colpa della modifica: lo segniamo come gestito.
    result[stage.key] = wasAlreadyDue ? sent[stage.key] : (sent[stage.key] ?? now.toISOString());
  }
  return result;
}
