"use client";

import { getConnection } from "@/lib/connection/use-connection";

import { createCloudSource } from "./cloud";
import { createLocalSource } from "./local";
import type { DataSource } from "./types";

export type {
  DataSource,
  Loaded,
  MenuSnapshot,
  SourceKind,
} from "./types";

// one instance each per tab. the supabase browser client inside the cloud one
// keeps the session, so building a new one on every call would be waste.
let cloud: DataSource | null = null;
let local: DataSource | null = null;

function cloudSource(): DataSource {
  if (!cloud) {
    cloud = createCloudSource();
  }

  return cloud;
}

function localSource(): DataSource {
  if (!local) {
    local = createLocalSource();
  }

  return local;
}

// which source answers the screens right now.
//
// this is the only place that choice is made. the screens call
// getDataSource() and never learn which one they got - though they can read
// `.kind` when the wording has to tell the truth, like "saved on the tablet"
// instead of "sent to kitchen".
//
// only a confirmed "offline" goes local. "checking" stays on the cloud on
// purpose: that is the first second after the app opens, and putting a sale
// on the tablet while the internet is fine only creates work.
export function getDataSource(): DataSource {
  return getConnection() === "offline" ? localSource() : cloudSource();
}
