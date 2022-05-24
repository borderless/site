import { GLOBAL_PAGE_CACHE } from "./common.js";

export type Cache = Map<string, object>;

export function getCache(existingCache?: Cache): Cache {
  const data = (globalThis as any)[GLOBAL_PAGE_CACHE];
  if (data) return new Map(data);
  return existingCache ?? new Map();
}
