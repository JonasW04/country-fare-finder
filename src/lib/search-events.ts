import type { SearchProgress, SearchResponse } from "./server/search";

/** Sent in Accept by clients that want progress events; any other request gets the single JSON response. */
export const SEARCH_STREAM_TYPE = "application/x-ndjson";

/** One line of a streamed search: progress reports, then exactly one result or error. */
export type SearchEvent =
  | ({ type: "progress" } & SearchProgress)
  | { type: "result"; response: SearchResponse }
  | { type: "error"; errors: string[] };
