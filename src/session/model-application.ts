import type { AcpClient, SessionCreateResult } from "../acp/client.js";
import { assertRequestedModelSupported, extractModelConfigOption } from "../acp/model-support.js";
import { withTimeout } from "../async-control.js";

export async function applyRequestedModelIfAdvertised(params: {
  client: AcpClient;
  sessionId: string;
  requestedModel: string | undefined;
  models: SessionCreateResult["models"];
  configOptions?: SessionCreateResult["configOptions"];
  agentCommand?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const requestedModel =
    typeof params.requestedModel === "string" ? params.requestedModel.trim() : "";
  if (!requestedModel) {
    return false;
  }
  assertRequestedModelSupported({
    requestedModel,
    models: params.models,
    configOptions: params.configOptions,
    agentCommand: params.agentCommand,
    context: "apply",
  });

  if (!params.models) {
    const modelOpt = extractModelConfigOption(params.configOptions);
    if (!modelOpt) {
      return false;
    }
    if (modelOpt.currentValue === requestedModel) {
      return true;
    }
    await withTimeout(
      params.client.setSessionConfigOption(params.sessionId, "model", requestedModel),
      params.timeoutMs,
    );
    return true;
  }

  if (params.models.currentModelId === requestedModel) {
    return true;
  }
  await withTimeout(
    params.client.setSessionModel(params.sessionId, requestedModel),
    params.timeoutMs,
  );
  return true;
}
