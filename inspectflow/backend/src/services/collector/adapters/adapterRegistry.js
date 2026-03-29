/**
 * Adapter registry — maps source_protocol to its parseFrame function.
 * BL-120 (INT-IOT-v1)
 */

import * as opcUaAdapter from "./opcUaAdapter.js";
import * as mqttAdapter from "./mqttAdapter.js";
import * as tcpAdapter from "./tcpAdapter.js";

const REGISTRY = new Map([
  ["opc_ua", opcUaAdapter],
  ["mqtt", mqttAdapter],
  ["tcp", tcpAdapter]
]);

/**
 * @param {string} sourceProtocol
 * @returns {{ parseFrame: Function }}
 * @throws {Error} if protocol is not registered
 */
export function resolveAdapter(sourceProtocol) {
  const adapter = REGISTRY.get(String(sourceProtocol || "").toLowerCase());
  if (!adapter) {
    throw new Error(`unknown_protocol: ${sourceProtocol}`);
  }
  return adapter;
}

export const SUPPORTED_PROTOCOLS = [...REGISTRY.keys()];
