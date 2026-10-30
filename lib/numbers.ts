// Number handling shared by the server-side verifier (lib/validate.ts) and the
// browser-side evidence highlighter (lib/client.ts). One tokenizer, so the UI can
// never disagree with the verifier about what counts as a number.

// Display tokens: ₹420, 3.4, 31%, 3x, 1.2 cr … but not the 2 in "D2C".
// The digit group cannot END on a comma, so "₹420, down" yields "₹420" and the
// flag message and the UI highlight do not swallow the punctuation.
export const NUMBER_TOKEN = /(?<![A-Za-z0-9.])₹?\d(?:[\d,]*\d)?(?:\.\d+)?(?:%|x|×)?(?![A-Za-z]{2,}|\d)/g;

export type NumberUnit = "" | "₹" | "%";
export const UNIT_NAME: Record<"₹" | "%", string> = { "₹": "a rupee amount", "%": "a percentage" };

// Thread counters ("1/5") and hashtags ("#Top10") are formatting, not claims.
// Replacements keep the original length so match offsets stay usable.
export const maskNonClaims = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\b\d+\s*\/\s*\d+\b/g, (m) => " ".repeat(m.length))
    .replace(/#[\w]+/g, (m) => " ".repeat(m.length));

export const normalizeNumber = (token: string) => {
  const n = token.replace(/[₹,%x×]/gi, "");
  return n.includes(".") ? String(parseFloat(n)) : String(parseInt(n, 10));
};

export const unitOf = (token: string): NumberUnit => (token.startsWith("₹") ? "₹" : /%$/.test(token) ? "%" : "");

/** Tokens with their unit, so a check can tell that "31%" is not the claim "31". */
export function extractNumberTokens(text: string): { token: string; value: string; unit: NumberUnit }[] {
  return (maskNonClaims(text).match(NUMBER_TOKEN) || [])
    .map((token) => ({ token, value: normalizeNumber(token), unit: unitOf(token) }))
    .filter((t) => t.value !== "NaN");
}

/** Normalised values only — what each number *is*, ignoring its unit. */
export const extractNumbers = (text: string): string[] => extractNumberTokens(text).map((t) => t.value);

export const numberValueSet = (text: string) => new Set(extractNumbers(text));

/** "%31", "₹420" — only tokens that carried a unit. */
export const numberUnitSet = (text: string) =>
  new Set(extractNumberTokens(text).filter((t) => t.unit).map((t) => t.unit + t.value));
