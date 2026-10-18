import type { Offer } from "../providers/types";
import type { SearchRequest } from "../search-request";
import { TtlCache } from "./cache";
import { loadSearchConfig } from "./config";
import { getProviderSelection } from "./provider-select";
import { runSearch } from "./search";
import type { SearchResponse } from "./search";

// Process-wide cache; the app is a single stateless container so this is the whole cache tier.
let cache: TtlCache<Offer[]> | null = null;

export function searchWithDefaults(request: SearchRequest): Promise<SearchResponse> {
  const config = loadSearchConfig();
  cache ??= new TtlCache<Offer[]>(config.cacheTtlMs);
  const selection = getProviderSelection();
  return runSearch(request, {
    provider: selection.provider,
    requested: selection.requested,
    fellBack: selection.fellBack,
    cache,
    config,
  });
}
