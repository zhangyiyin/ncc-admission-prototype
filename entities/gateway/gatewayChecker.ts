import { assertFr } from "../common/crypto/fr.ts";
import {
  hashAction,
  hashActionContext,
  hashAmount,
  hashScope
} from "../common/crypto/hashObjects.ts";
import type {
  AcceptedRecordLike,
  GatewayCheckResult,
  GatewayDigests,
  GatewayExecutionPackage
} from "./gatewayTypes.ts";

export function parseNumberish(value: string | bigint): bigint {
  if (typeof value === "bigint") {
    return assertFr(value);
  }

  const s = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) {
    return assertFr(BigInt(s));
  }
  if (/^[0-9]+$/.test(s)) {
    return assertFr(BigInt(s));
  }

  throw new Error(`expected decimal or hex integer string, got: ${value}`);
}

function toDecimal(value: string | bigint): string {
  return parseNumberish(value).toString(10);
}

export async function computeGatewayDigests(pkg: GatewayExecutionPackage): Promise<GatewayDigests> {
  const scopeHash = await hashScope(
    parseNumberish(pkg.scope.e),
    parseNumberish(pkg.scope.policyID),
    parseNumberish(pkg.scope.gatewayID)
  );

  const amountCom = await hashAmount(
    parseNumberish(pkg.execution.amount),
    parseNumberish(pkg.execution.rAmt),
    scopeHash,
    parseNumberish(pkg.execution.nonce)
  );

  const actionContextHash = await hashActionContext(
    parseNumberish(pkg.execution.category),
    parseNumberish(pkg.execution.chainID),
    parseNumberish(pkg.execution.contractAddr),
    parseNumberish(pkg.execution.nonce),
    parseNumberish(pkg.execution.receiverDigest)
  );

  const actionHash = await hashAction(scopeHash, amountCom, actionContextHash);

  return { scopeHash, amountCom, actionContextHash, actionHash };
}

export function checkAcceptedRecordAgainstPackage(
  pkg: GatewayExecutionPackage,
  record: AcceptedRecordLike,
  digests: GatewayDigests
): GatewayCheckResult {
  const recordExists = record.exists === true;

  const checks = {
    recordExists,
    rhoMatches: recordExists && toDecimal(record.rho) === toDecimal(pkg.rho),
    amountComMatches: recordExists && toDecimal(record.amountCom) === digests.amountCom.toString(10),
    actionHashMatches: recordExists && toDecimal(record.actionHash) === digests.actionHash.toString(10),
    clauseComMatches: recordExists && toDecimal(record.clauseCom) === toDecimal(pkg.expectedPublic.clauseCom),
    cNewMatches: recordExists && toDecimal(record.C_new) === toDecimal(pkg.expectedPublic.C_new),
    nOldMatches: recordExists && toDecimal(record.N_old) === toDecimal(pkg.expectedPublic.N_old),
    rtStateMatches: recordExists && toDecimal(record.rtState) === toDecimal(pkg.expectedPublic.rtState)
  };

  const failures: string[] = [];
  for (const [name, ok] of Object.entries(checks)) {
    if (!ok) failures.push(name);
  }

  return {
    accepted: failures.length === 0,
    checks,
    failures
  };
}
