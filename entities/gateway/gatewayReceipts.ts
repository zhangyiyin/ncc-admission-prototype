import type {
  AcceptedRecordLike,
  GatewayCheckResult,
  GatewayExecutionPackage,
  GatewayReceipt
} from "./gatewayTypes.ts";
import { parseNumberish } from "./gatewayChecker.ts";

function decimalOrZero(value: string | bigint | undefined): string {
  if (value === undefined) return "0";
  return parseNumberish(value).toString(10);
}

export function createGatewayReceipt(
  pkg: GatewayExecutionPackage,
  record: AcceptedRecordLike,
  result: GatewayCheckResult
): GatewayReceipt {
  return {
    label: pkg.label,
    rho: parseNumberish(pkg.rho).toString(10),
    accepted: result.accepted,
    checks: result.checks,
    record: {
      rho: decimalOrZero(record.rho),
      N_old: decimalOrZero(record.N_old),
      C_new: decimalOrZero(record.C_new),
      rtState: decimalOrZero(record.rtState),
      newStateRoot: decimalOrZero(record.newStateRoot),
      stateIndex: decimalOrZero(record.stateIndex),
      actionHash: decimalOrZero(record.actionHash),
      amountCom: decimalOrZero(record.amountCom),
      clauseCom: decimalOrZero(record.clauseCom)
    },
    privateExecution: {
      amount: pkg.execution.amount,
      receiverDigest: pkg.execution.receiverDigest
    }
  };
}
