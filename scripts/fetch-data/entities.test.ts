import { describe, expect, it } from "vitest";
import { decodeEntities } from "./entities";

describe("decodeEntities (FR-2 AC1)", () => {
  it('decodes "Fin Accountg&amp;Reportg" to "Fin Accountg&Reportg"', () => {
    expect(decodeEntities("Fin Accountg&amp;Reportg")).toBe("Fin Accountg&Reportg");
  });

  it("decodes &#39; to an apostrophe", () => {
    expect(decodeEntities("O&#39;Bryant Hall")).toBe("O'Bryant Hall");
  });

  it("decodes every named entity the spec lists", () => {
    expect(decodeEntities("&amp; &lt; &gt; &quot; &#39; &apos;")).toBe(`& < > " ' '`);
  });

  it("decodes decimal and hex numeric entities", () => {
    expect(decodeEntities("caf&#233; &#x2014; &#X41;")).toBe("café — A");
  });

  it("decodes in one pass, so an escaped entity stays escaped", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("leaves unknown, invalid and unterminated entities alone", () => {
    expect(decodeEntities("&nope; &constructor; &#0; &#xD800; &#99999999; & &amp")).toBe(
      "&nope; &constructor; &#0; &#xD800; &#99999999; & &amp",
    );
  });

  it("returns text with no entities unchanged", () => {
    expect(decodeEntities("")).toBe("");
    expect(decodeEntities("Snell Library")).toBe("Snell Library");
  });
});
