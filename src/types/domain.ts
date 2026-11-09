export const severityValues = ["low", "medium", "high"] as const;
export type TaskSeverity = (typeof severityValues)[number];

export const webLoginRequestStatusValues = ["pending", "approved", "claimed", "expired"] as const;
export type WebLoginRequestStatus = (typeof webLoginRequestStatusValues)[number];

export const assignModeValues = ["anyone", "single", "alternate", "custom"] as const;
/** anyone = chiunque; single = solo un utente; alternate = a turno; custom = turni personalizzati. */
export type AssignMode = (typeof assignModeValues)[number];

export const slotKindValues = ["day", "week", "month"] as const;
/** Finestra di un turno personalizzato: un giorno specifico, entro una settimana, entro un mese. */
export type SlotKind = (typeof slotKindValues)[number];

export type TaskSlot = {
  id: number;
  taskId: number;
  userId: number;
  userName: string;
  kind: SlotKind;
  startsAt: string;
  dueAt: string;
};

export const digestKindValues = ["morning", "evening"] as const;
/** morning = "buongiorno", evening = "riepilogo serale". */
export type DigestKind = (typeof digestKindValues)[number];

export type DigestSettings = {
  kind: DigestKind;
  enabled: boolean;
  /** Ora locale "HH:MM" (fuso della casa, default Europe/Rome). */
  time: string;
  /** Frase iniziale personalizzata; null = testo predefinito. */
  intro: string | null;
  skipIfEmpty: boolean;
  lastSentDate: string | null;
};

export type LogKind = "done" | "created" | "updated" | "deleted";

export type AppUser = {
  id: number;
  telegramId: number;
  username: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type House = {
  id: number;
  name: string;
  chatId: number;
  notifyChanges: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HouseMember = {
  userId: number;
  displayName: string;
  username: string | null;
  joinedAt: string;
};

export type Task = {
  id: number;
  houseId: number | null;
  createdBy: number;
  name: string;
  intervalMs: number;
  severity: TaskSeverity;
  cycleAnchorAt: string;
  reminderThreeHoursSentAt: string | null;
  reminderThirtyMinutesSentAt: string | null;
  overdueNoticeSentAt: string | null;
  nudgeSentAt: string | null;
  lastCompletedBy: number | null;
  lastCompletedByName: string | null;
  completedCount: number;
  assignMode: AssignMode;
  /** Utenti coinvolti: [id] per 'single', ordine dei turni per 'alternate'. */
  assignUserIds: number[];
  assignTurn: number;
  /** A chi tocca adesso (null = chiunque). */
  assigneeId: number | null;
  assigneeName: string | null;
  /** Turno personalizzato aperto con la scadenza piu' vicina: se presente decide la scadenza. */
  slotStartsAt?: string | null;
  slotDueAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskWithHouse = Task & {
  house: House;
};

export type LogEntry = {
  id: number;
  houseId: number;
  userId: number | null;
  userName: string;
  taskId: number | null;
  taskName: string;
  kind: LogKind;
  detail: string | null;
  /** true se l'attivita' non esiste piu' e si puo' ricreare con le impostazioni salvate nel registro. */
  restorable: boolean;
  createdAt: string;
};

export type WebLoginRequest = {
  token: string;
  /** Codice di 6 cifre da scrivere al bot (null per le richieste create prima della migrazione 0028). */
  code: string | null;
  status: WebLoginRequestStatus;
  telegramId: number | null;
  username: string | null;
  displayName: string | null;
  approvedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export type AbsenceStatus = "pending" | "active" | "ended" | "cancelled";

/** "Sono fuori casa": pending finche' un altro coinquilino non conferma, poi active fino al rientro. */
export type Absence = {
  id: number;
  houseId: number;
  userId: number;
  userName: string;
  status: AbsenceStatus;
  startsAt: string;
  approvedBy: number | null;
  approvedByName: string | null;
  endedAt: string | null;
  messageId: number | null;
};

export type TurnSwapStatus = "pending" | "accepted" | "rejected" | "cancelled";

/** Richiesta di scambio di turno su un'attivita' "a turno": `target` accetta o rifiuta. */
export type TurnSwap = {
  id: number;
  houseId: number;
  taskId: number;
  taskName: string;
  requesterId: number;
  requesterName: string;
  targetId: number;
  targetName: string;
  status: TurnSwapStatus;
  createdAt: string;
  messageId: number | null;
};

/** Scadenza spostata al rientro: `overdue` = era scaduta durante l'assenza e va fatta il giorno del rientro. */
export type MovedTask = {
  task: Task;
  dueAt: Date;
  overdue: boolean;
  /** Tempo regalato (solo per quelle non scadute). */
  shiftMs: number;
};

export type NoticeStageKey = "three_hours" | "thirty_minutes" | "overdue" | "nudge";

export type NoticeStage = {
  key: NoticeStageKey;
  at: Date;
};
