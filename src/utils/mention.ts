/**
 * Tag Telegram nei testi del bot. I messaggi sono testo semplice: un nome da taggare viene marcato con
 * caratteri privati (mai digitati dagli utenti) e al momento dell'invio diventa un'entita' `text_mention`,
 * che notifica la persona anche se non ha uno @username.
 */
const START = "";
const MID = "";
const END = "";
const pattern = new RegExp(`${START}(\\d+)${MID}([^${END}]*)${END}`, "g");

export type MentionEntity = {
  type: "text_mention";
  offset: number;
  length: number;
  user: { id: number; is_bot: false; first_name: string };
};

/** Il nome, taggato se si conosce l'id Telegram. */
export function mention(name: string, telegramId: number | null | undefined): string {
  return telegramId ? `${START}${telegramId}${MID}${name}${END}` : name;
}

/** Testo pronto da inviare + entita' dei tag (gli offset in UTF-16 coincidono con gli indici delle stringhe JS). */
export function renderMentions(text: string): { text: string; entities: MentionEntity[] } {
  const entities: MentionEntity[] = [];
  let out = "";
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    out += text.slice(last, match.index);
    const name = match[2]!;
    if (name) {
      entities.push({ type: "text_mention", offset: out.length, length: name.length, user: { id: Number(match[1]), is_bot: false, first_name: name } });
    }
    out += name;
    last = match.index! + match[0].length;
  }
  return { text: out + text.slice(last), entities };
}

/** Solo il testo, senza tag (anteprime nel portale, test). */
export function plainText(text: string): string {
  return renderMentions(text).text;
}
