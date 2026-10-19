import type { SearchEvent } from "@/lib/search-events";

/** Calls `onLine` with each parsed line of an NDJSON body as soon as the line is complete. */
export async function readNdjson(body: ReadableStream<Uint8Array>, onLine: (value: unknown) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // stream: true holds back a multi-byte character split across chunks.
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onLine(JSON.parse(line));
  }
  buffer += decoder.decode();
  if (buffer.trim()) onLine(JSON.parse(buffer));
}

const EVENT_TYPES = new Set(["progress", "result", "error"]);

export function isSearchEvent(value: unknown): value is SearchEvent {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && EVENT_TYPES.has(type);
}
