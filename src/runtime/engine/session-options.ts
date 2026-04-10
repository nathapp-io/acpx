import type { SessionRecord } from "../../types.js";

export type SessionAgentOptions = {
  model?: string;
  allowedTools?: string[];
  maxTurns?: number;
};

export function mergeSessionOptions(
  preferred: SessionAgentOptions | undefined,
  fallback: SessionAgentOptions | undefined,
): SessionAgentOptions | undefined {
  const merged: SessionAgentOptions = {
    ...fallback,
  };
  if (preferred?.model !== undefined) {
    merged.model = preferred.model;
  }
  if (preferred?.allowedTools !== undefined) {
    merged.allowedTools = preferred.allowedTools;
  }
  if (preferred?.maxTurns !== undefined) {
    merged.maxTurns = preferred.maxTurns;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function sessionOptionsFromRecord(record: SessionRecord): SessionAgentOptions | undefined {
  const stored = record.acpx?.session_options;
  if (!stored) {
    return undefined;
  }

  const sessionOptions: SessionAgentOptions = {};

  if (typeof stored.model === "string" && stored.model.trim().length > 0) {
    sessionOptions.model = stored.model;
  }
  if (Array.isArray(stored.allowed_tools)) {
    sessionOptions.allowedTools = [...stored.allowed_tools];
  }
  if (typeof stored.max_turns === "number") {
    sessionOptions.maxTurns = stored.max_turns;
  }

  return Object.keys(sessionOptions).length > 0 ? sessionOptions : undefined;
}
