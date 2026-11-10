/**
 * Decodes the HTML entities Banner puts in its text fields
 * ("Fin Accountg&amp;Reportg"). Hand-rolled so the script needs no dependency
 * (docs/specs/FR-2.md). Decoding is a single pass, so "&amp;lt;" becomes "&lt;",
 * not "<". Unknown or invalid entities are left as they are.
 */

const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

const ENTITY_PATTERN = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;

function fromCodePoint(codePoint: number): string | null {
  const valid =
    Number.isSafeInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff);
  return valid ? String.fromCodePoint(codePoint) : null;
}

export function decodeEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (entity: string, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return fromCodePoint(Number.parseInt(body.slice(2), 16)) ?? entity;
    }
    if (body.startsWith("#")) {
      return fromCodePoint(Number.parseInt(body.slice(1), 10)) ?? entity;
    }
    return NAMED_ENTITIES.get(body) ?? entity;
  });
}
