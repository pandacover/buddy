import type { BuddyReply, PointerTarget } from "./protocol";

const POINT_TAG =
  /<\s*POINT\b([^>]*)\/?\s*>/i;
const POINT_ATTR = /(x|y|label)\s*=\s*["']([^"']+)["']/gi;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readPoint(value: unknown): PointerTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = asNumber(record.x);
  const y = asNumber(record.y);
  if (x === null || y === null) return null;
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : "Here";
  return { x: clamp01(x), y: clamp01(y), label };
}

function parsePointTag(text: string): PointerTarget | null {
  const match = text.match(POINT_TAG);
  if (!match?.[1]) return null;
  const attrs: Record<string, string> = {};
  for (const attr of match[1].matchAll(POINT_ATTR)) {
    attrs[attr[1].toLowerCase()] = attr[2];
  }
  return readPoint(attrs);
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as unknown;
    } catch {
      return null;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

function stripPointTags(text: string): string {
  return text.replace(POINT_TAG, "").trim();
}

export function parseBuddyReply(raw: string): BuddyReply {
  const json = extractJsonObject(raw);
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const speechCandidate =
      typeof record.speech === "string"
        ? record.speech
        : typeof record.answer === "string"
          ? record.answer
          : typeof record.text === "string"
            ? record.text
            : "";
    const point =
      readPoint(record.point) ??
      readPoint(record.pointer) ??
      parsePointTag(speechCandidate) ??
      parsePointTag(raw);

    const speech = stripPointTags(speechCandidate) || stripPointTags(raw);
    return {
      speech: speech || "I am not sure what to say.",
      point,
    };
  }

  const point = parsePointTag(raw);
  const speech = stripPointTags(raw);
  return {
    speech: speech || "I am not sure what to say.",
    point,
  };
}
