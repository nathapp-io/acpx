/**
 * Model selection shared by every layer that creates an ACP session.
 *
 * This lives under `src/acp` with no imports of its own because `src/acp` and
 * `src/flows` may not depend on `src/runtime`, and both need it. Typed
 * structurally for the same reason: the full `SessionAgentOptions` is declared
 * in `src/runtime/engine`, which neither layer may reach.
 */
export type SessionModelSelection = {
  model?: string;
  /**
   * Model used when a session is created and no explicit `model` was
   * requested. Never applied to an existing session.
   */
  defaultModel?: string;
};

/**
 * Model to request while creating a session: an explicit `model` first, then a
 * configured default. Existing-session paths use `model` alone, so a configured
 * default cannot take back a model the user selected with `set model`.
 */
export function sessionCreationModel(
  options: SessionModelSelection | undefined,
): string | undefined {
  return options?.model ?? options?.defaultModel;
}
