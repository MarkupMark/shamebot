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
});
