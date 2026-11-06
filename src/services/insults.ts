import type { Task, TaskSeverity } from "../types/domain.js";

/**
 * Messaggi predefiniti, usati quando nessun altro coinquilino ha scritto insulti per quella gravita'.
 * {nome} = a chi tocca, {attivita} = l'attivita'.
 */
export const defaultInsults: Record<TaskSeverity, string[]> = {
  low: [
    "{nome}, dai, è solo {attivita}. Ce la puoi fare 🙄",
    "{attivita} aspetta ancora, {nome}. Con calma eh.",
    "Piccolo promemoria per {nome}: {attivita} non si fa da sola.",
  ],
  medium: [
    "{nome}, {attivita} è scaduta. La casa ti guarda 👀",
    "Ehi {nome}, {attivita} non si fa con la forza del pensiero.",
    "{nome}, anche oggi niente {attivita}? Interessante scelta di vita.",
  ],
  high: [
    "{nome}, {attivita} è IMPORTANTE. Vergognati 🔔",
    "Shame, shame, shame 🔔 {nome}, {attivita} è ancora da fare.",
    "{nome}, i coinquilini stanno valutando lo sfratto. Fai {attivita}.",
  ],
};

export const maxInsultsPerSeverity = 15;
export const maxInsultLength = 200;

/** Sceglie un elemento a caso; sostituibile nei test. */
export type Chooser = <T>(items: T[]) => T | undefined;
export const randomPick: Chooser = (items) => items[Math.floor(Math.random() * items.length)];

/** Riempie i segnaposto: senza assegnatario l'insulto va a tutta la casa ("ragazzi"). */
export function fillInsult(template: string, task: Pick<Task, "name" | "assigneeName">): string {
  return template.replace(/\{nome\}/gi, task.assigneeName ?? "ragazzi").replace(/\{attivit[aà]\}/gi, task.name);
}
