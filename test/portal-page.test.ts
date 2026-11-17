import { describe, expect, it } from "vitest";
import { renderAppPage } from "../src/web/page.js";

describe("portale", () => {
  const html = renderAppPage({ botUsername: "shamebot_test" });
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it("il JavaScript del portale e' valido", () => {
    expect(inline.length).toBeGreaterThan(0);
    for (const code of inline) expect(() => new Function(code)).not.toThrow();
  });

  it("Prossime scadenze raggruppa per scadenza invece della timeline", () => {
    expect(html).toContain("Entro domenica");
    expect(html).toContain("Entro fine mese");
    expect(html).not.toContain("tl-axis");
  });

  it("un solo filtro 'Tutte' / 'Prima le mie' per tutto il portale, ricordato nel browser", () => {
    expect(html).toContain("Prima le mie");
    expect(html).not.toContain("Solo mie");
    expect(html).not.toContain("Mie + chiunque");
    expect(html).toContain('localStorage.setItem("taskOrder"');
    expect(html.match(/function orderToggle/g)).toHaveLength(1);
  });

  it("'Entro domenica' parte collassato a 3 attivita' con 'Vedi tutte'", () => {
    expect(html).toContain("var WEEK_PREVIEW = 3;");
    expect(html).toContain("weekExpanded: false");
    expect(html).toContain('"Vedi tutte ("');
  });

  it("una sola lista: Prossime scadenze ha Fatto, Modifica ed Elimina e la vecchia lista non c'e' piu'", () => {
    expect(html).toContain("function taskDetails");
    expect(html).toContain('"primary dl-done"');
    expect(html).toContain('"✏️ Modifica"');
    expect(html).toContain('"🗑 Elimina"');
    expect(html).not.toContain("function taskCard");
    expect(html).not.toContain("function taskGroups");
    // la lista sta dentro la scheda Attivita', non piu' sopra tutte le schede
    expect(html).toContain("var parts = [header, viewAbsences(), viewSwaps(), tabs,");
  });

  it("la frequenza 'Ogni mese' si salva come mese", () => {
    expect(html).toContain('value: "1 mese"');
    expect(html).not.toContain('value: "30 giorni"');
  });
});
