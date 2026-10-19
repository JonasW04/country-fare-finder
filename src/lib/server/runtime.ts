import type { Offer } from "../providers/types";
import type { SearchRequest } from "../search-request";
import { TtlCache } from "./cache";
import { loadSearchConfig } from "./config";
import { getProviderSelection } from "./provider-select";
import { runSearch } from "./search";
import type { SearchProgress, SearchResponse } from "./search";

// Process-wide cache; the app is a single stateless container so this is the whole cache tier.
let cache: TtlCache<Offer[]> | null = null;

export function searchWithDefaults(request: SearchRequest, onProgress?: (progress: SearchProgress) => void): Promise<SearchResponse> {
  const selection = getProviderSelection();
  const config = loadSearchConfig(process.env, selection.defaults);
  cache ??= new TtlCache<Offer[]>(config.cacheTtlMs);
  return runSearch(request, {
    provider: selection.provider,
    requested: selection.requested,
    fellBack: selection.fellBack,
    cache,
    config,
    onProgress,
  });
}
