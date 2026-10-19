import type { SearchEvent } from "../search-events";
import type { SearchProgress, SearchResponse } from "./search";

// Deliberately generic: provider errors never go to the client unfiltered.
export const SEARCH_FAILED = "Search failed. Check the server logs.";

/**
 * Runs a search and writes its events as NDJSON, one JSON object per line. A client that goes away
 * does not stop the search: its lookups still fill the cache for the next try.
 */
export function searchEventStream(run: (onProgress: (progress: SearchProgress) => void) => Promise<SearchResponse>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let open = true;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SearchEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      void (async () => {
        try {
          send({ type: "result", response: await run((progress) => send({ type: "progress", ...progress })) });
        } catch {
          send({ type: "error", errors: [SEARCH_FAILED] });
        }
        if (open) controller.close();
      })();
    },
    cancel() {
      open = false;
    },
  });
}
