"use client";

import { createCloudSource } from "./cloud";
import type { DataSource } from "./types";

export type {
  DataSource,
  Loaded,
  MenuSnapshot,
  SourceKind,
} from "./types";

// one instance per tab. the supabase browser client inside it keeps the
// session, so building a new one on every call would be waste.
let cloud: DataSource | null = null;

// which source answers the screens right now.
//
// there is only the cloud one today. when the local (offline) source lands,
// the choice goes here and nowhere else: the screens call getDataSource() and
// never learn which one they got.
export function getDataSource(): DataSource {
  if (!cloud) {
    cloud = createCloudSource();
  }

  return cloud;
}
