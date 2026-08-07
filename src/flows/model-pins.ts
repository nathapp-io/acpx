import path from "node:path";
import type { AcpNodeDefinition, FlowDefinition, FlowEdge, ResolvedFlowAgent } from "./types.js";

type PinnedNode = { nodeId: string; model: string };

/**
 * Node/agent models can carry surrounding whitespace: `acp()` trims it, but a
 * flow node authored as a plain object literal only gets *validated* as
 * non-blank-when-trimmed, not trimmed, since `assertValidFlowDefinitionShape`
 * discards its parsed result. Every reader of a model pin normalizes through
 * here so a padded and unpadded spelling of the same model are never treated
 * as a conflict, and so the value that reaches session creation is normalized
 * regardless of how the node was authored.
 *
 * `model` is typed as `string | undefined`, but a node predating this field
 * can carry unrelated pass-through metadata of any shape under that same
 * key (schema validation deliberately leaves such values untouched — see
 * `modelPinSchema` in `schema.ts`). Anything that is not a non-blank string
 * is treated as no pin rather than coerced or thrown on.
 */
export function normalizeModelPin(model: unknown): string | undefined {
  if (typeof model !== "string") {
    return undefined;
  }
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves a node profile to its agent, or `undefined` when it cannot be
 * resolved yet. Supplied by the runner so the preflight can also see a
 * configured `agents.<name>.model`, which is a pin the same way a node's own
 * `model` is. Definition-level validation runs without one.
 */
export type FlowPinAgentResolver = (profile: string | undefined) => ResolvedFlowAgent | undefined;

/**
 * A session is created once per (agent command, cwd, handle). A node that
 * reuses an existing binding never gets to apply its own model, so two nodes
 * that share one session but pin different models would silently run the model
 * of whichever node created the session. Reject that up front instead.
 *
 * Only nodes certain to collide are compared: an isolated node gets its own
 * session, a node whose cwd is computed at run time cannot be grouped
 * statically, a node no run can reach never executes, and two nodes on
 * mutually exclusive branches never share a run. Whatever this cannot decide
 * is left to the runtime guard in `assertReusableSessionModel`.
 */
export function validateFlowSessionModelPins(
  flow: FlowDefinition,
  resolveAgent?: FlowPinAgentResolver,
): void {
  const groups = new Map<string, PinnedNode[]>();
  const successors = successorsByNode(flow.edges);
  const live = reachableFrom(successors, flow.startAt).add(flow.startAt);

  for (const [nodeId, node] of sharedSessionAcpNodes(flow)) {
    const pin = sessionModelPin(node, resolveAgent);
    if (pin === undefined || !live.has(nodeId)) {
      continue;
    }
    const pinned = groups.get(pin.group) ?? [];
    assertNoConflictingPin(pinned, { nodeId, model: pin.model }, successors, node);
    pinned.push({ nodeId, model: pin.model });
    groups.set(pin.group, pinned);
  }
}

/**
 * The model this node requires and the key of the session it would use, or
 * `undefined` when it requires no particular model or the session it lands on
 * cannot be known without running the flow.
 */
function sessionModelPin(
  node: AcpNodeDefinition,
  resolveAgent: FlowPinAgentResolver | undefined,
): { group: string; model: string } | undefined {
  if (typeof node.cwd === "function") {
    return undefined;
  }
  const agent = resolveAgent?.(node.profile);
  if (resolveAgent && !agent) {
    return undefined;
  }
  const model = normalizeModelPin(node.model) ?? normalizeModelPin(agent?.model);
  return model === undefined ? undefined : { group: sessionGroupKey(node, agent), model };
}

/**
 * Identity of the session this node would bind to, as far as it is knowable.
 *
 * The cwd is resolved the way `resolveNodeCwd` resolves it at run time, so
 * equivalent spellings — `.` and the agent's own absolute cwd, say — group
 * together. Comparing the raw strings would file them as separate sessions and
 * let the first ACP step run before the runtime guard rejected the second.
 *
 * Without a resolved agent there is no base to resolve against, so the raw
 * value is kept: definition-level validation cannot know where a relative cwd
 * lands. The runner preflight passes a resolver, so real conflicts are still
 * caught before any step runs.
 */
function sessionGroupKey(node: AcpNodeDefinition, agent: ResolvedFlowAgent | undefined): string {
  const handle = node.session?.handle ?? "main";
  const nodeCwd = typeof node.cwd === "string" ? node.cwd : undefined;
  return agent
    ? JSON.stringify([agent.agentCommand, path.resolve(agent.cwd, nodeCwd ?? agent.cwd), handle])
    : JSON.stringify([node.profile ?? "", nodeCwd ?? "", handle]);
}

function assertNoConflictingPin(
  pinned: PinnedNode[],
  candidate: PinnedNode,
  successors: Map<string, Set<string>>,
  node: Pick<AcpNodeDefinition, "session">,
): void {
  for (const other of pinned) {
    if (other.model !== candidate.model && canShareOneRun(successors, other.nodeId, candidate)) {
      throw new Error(sharedSessionPinError(other, candidate, node));
    }
  }
}

/** Two nodes can run in one execution only if one is reachable from the other. */
function canShareOneRun(
  successors: Map<string, Set<string>>,
  nodeId: string,
  candidate: PinnedNode,
): boolean {
  return (
    reachableFrom(successors, nodeId).has(candidate.nodeId) ||
    reachableFrom(successors, candidate.nodeId).has(nodeId)
  );
}

function reachableFrom(successors: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...(successors.get(start) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    queue.push(...(successors.get(next) ?? []));
  }
  return seen;
}

function successorsByNode(edges: FlowEdge[]): Map<string, Set<string>> {
  const successors = new Map<string, Set<string>>();
  for (const edge of edges) {
    const targets = "to" in edge ? [edge.to] : Object.values(edge.switch.cases);
    const existing = successors.get(edge.from) ?? new Set<string>();
    for (const target of targets) {
      existing.add(target);
    }
    successors.set(edge.from, existing);
  }
  return successors;
}

function sharedSessionPinError(
  first: PinnedNode,
  second: PinnedNode,
  node: Pick<AcpNodeDefinition, "session">,
): string {
  const handle = node.session?.handle ?? "main";
  return [
    `Flow nodes "${first.nodeId}" and "${second.nodeId}" share session handle "${handle}"`,
    ` but pin different models ("${first.model}" vs "${second.model}").`,
    " A model is applied when the shared session is created, so the second pin would be ignored.",
    " Give each node its own session with `session: { isolated: true }`,",
    " or put them on distinct session handles.",
  ].join("");
}

function sharedSessionAcpNodes(flow: FlowDefinition): Array<[string, AcpNodeDefinition]> {
  return Object.entries(flow.nodes).filter(
    (entry): entry is [string, AcpNodeDefinition] =>
      entry[1].nodeType === "acp" && !entry[1].session?.isolated,
  );
}
