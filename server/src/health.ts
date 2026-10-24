import type { LlmProviderId } from "./llm/provider.js";
import type { PaymentsMode } from "./payments/service.js";

/** JSON body of `GET /api/health`. The MCP `chotu_health` tool returns this object. */
export interface ApiHealth {
  ok: true;
  mock: boolean;
  memory: boolean;
  llm: LlmProviderId;
  payments: PaymentsMode;
}

export function apiHealthBody(input: {
  mock: boolean;
  memory: boolean;
  llm: LlmProviderId;
  payments: PaymentsMode;
}): ApiHealth {
  return {
    ok: true,
    mock: input.mock,
    memory: input.memory,
    llm: input.llm,
    payments: input.payments,
  };
}
