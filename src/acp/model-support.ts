import type {
  SessionConfigOption,
  SessionConfigSelectOption,
  SessionModelState,
} from "@agentclientprotocol/sdk";
import { isClaudeAcpCommand } from "./agent-command.js";
import { splitCommandLine } from "./client-process.js";

export class RequestedModelUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestedModelUnsupportedError";
  }
}

export function supportsLegacyClaudeCodeModelMetadata(agentCommand: string | undefined): boolean {
  if (!agentCommand) {
    return false;
  }
  const { command, args } = splitCommandLine(agentCommand);
  return isClaudeAcpCommand(command, args);
}

export function formatAvailableModelIds(models: SessionModelState | undefined): string {
  const ids =
    models?.availableModels
      .map((model) => model.modelId.trim())
      .filter((modelId) => modelId.length > 0) ?? [];
  return ids.length > 0 ? ids.join(", ") : "none advertised";
}

function flattenConfigSelectOptions(
  opt: SessionConfigOption & { type: "select" },
): SessionConfigSelectOption[] {
  return (Array.isArray(opt.options) ? opt.options : []).flatMap((entry) =>
    "options" in entry ? entry.options : [entry],
  );
}

export function extractModelConfigOption(
  configOptions: SessionConfigOption[] | undefined,
): (SessionConfigOption & { type: "select" }) | undefined {
  if (!configOptions) {
    return undefined;
  }
  for (const opt of configOptions) {
    if (opt.type === "select" && (opt.category === "model" || opt.id === "model")) {
      return opt;
    }
  }
  return undefined;
}

export function formatConfigOptionModelIds(
  configOptions: SessionConfigOption[] | undefined,
): string {
  const opt = extractModelConfigOption(configOptions);
  if (!opt) {
    return "none advertised";
  }
  const ids = flattenConfigSelectOptions(opt)
    .map((o) => o.value.trim())
    .filter((v) => v.length > 0);
  return ids.length > 0 ? ids.join(", ") : "none advertised";
}

function assertModelInConfigOptions(
  requestedModel: string,
  configOptions: SessionConfigOption[] | undefined,
  action: string,
): void {
  const modelOpt = extractModelConfigOption(configOptions);
  if (!modelOpt) {
    throw new RequestedModelUnsupportedError(
      `Cannot ${action} "${requestedModel}": the ACP agent did not advertise model support. Generic model selection requires ACP models plus session/set_model support, or an adapter-specific startup model flag.`,
    );
  }
  const advertised = new Set(flattenConfigSelectOptions(modelOpt).map((o) => o.value.trim()));
  if (!advertised.has(requestedModel.trim())) {
    throw new RequestedModelUnsupportedError(
      `Cannot ${action} "${requestedModel}": the ACP agent did not advertise that model. Available models: ${formatConfigOptionModelIds(configOptions)}.`,
    );
  }
}

export function assertRequestedModelSupported(params: {
  requestedModel: string;
  models: SessionModelState | undefined;
  configOptions?: SessionConfigOption[];
  agentCommand?: string;
  context: "apply" | "replay";
}): void {
  const action = params.context === "replay" ? "replay saved model" : "apply --model";
  if (!params.models) {
    if (supportsLegacyClaudeCodeModelMetadata(params.agentCommand)) {
      return;
    }
    assertModelInConfigOptions(params.requestedModel, params.configOptions, action);
    return;
  }
  const advertised = new Set(params.models.availableModels.map((model) => model.modelId));
  if (!advertised.has(params.requestedModel)) {
    throw new RequestedModelUnsupportedError(
      `Cannot ${action} "${params.requestedModel}": the ACP agent did not advertise that model. Available models: ${formatAvailableModelIds(params.models)}.`,
    );
  }
}
