import { poseidonHash } from "./poseidon.ts";
import { TAGS } from "./tags.ts";

export async function hashOwner(skU: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_OWN, skU]);
}

export async function hashScope(e: bigint, policyID: bigint, gatewayID: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_SCOPE, e, policyID, gatewayID]);
}

export async function hashPolicyScope(e: bigint, policyID: bigint, gatewayID: bigint, policyVersion: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_POLICY_SCOPE, e, policyID, gatewayID, policyVersion]);
}

export async function hashStateCore(usedAmount: bigint, txCount: bigint, riskLevel: bigint, flags: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_STATE_CORE, usedAmount, txCount, riskLevel, flags]);
}

export async function hashState(owner: bigint, scopeHash: bigint, stateCoreHash: bigint, r: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_STATE, owner, scopeHash, stateCoreHash, r]);
}

export async function hashAmount(amount: bigint, rAmt: bigint, scopeHash: bigint, nonce: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_AMOUNT, amount, rAmt, scopeHash, nonce]);
}

export async function hashGenesisNullifier(skU: bigint, scopeHash: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_GEN, skU, scopeHash]);
}

export async function hashStateNullifier(skU: bigint, cOld: bigint, scopeHash: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_STATE_NULL, skU, cOld, scopeHash]);
}

export async function hashRegLeaf(owner: bigint, regScope: bigint, regSalt: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_REG, owner, regScope, regSalt]);
}

export async function hashStatusLeaf(owner: bigint, statusActive: bigint, e: bigint, statusSalt: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_STATUS, owner, statusActive, e, statusSalt]);
}

export async function hashPolicyParams(limit: bigint, threshold: bigint, clauseType: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_POLICY_PARAMS, limit, threshold, clauseType]);
}

export async function hashPolicyLeaf(policyScopeHash: bigint, policyParamsHash: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_POLICY_LEAF, policyScopeHash, policyParamsHash]);
}

export async function hashActionContext(category: bigint, chainID: bigint, contractAddr: bigint, nonce: bigint, receiverDigest: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_ACTION_CONTEXT, category, chainID, contractAddr, nonce, receiverDigest]);
}

export async function hashAction(scopeHash: bigint, amountCom: bigint, actionContextHash: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_ACTION, scopeHash, amountCom, actionContextHash]);
}

export async function hashMockSofEvidence(scopeHash: bigint, nonce: bigint, evidenceSalt: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_MOCK_SOF, scopeHash, nonce, evidenceSalt]);
}

export async function hashClause(actionHash: bigint, clauseType: bigint, clauseStatus: bigint, evidenceDigest: bigint, rClause: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_CLAUSE, actionHash, clauseType, clauseStatus, evidenceDigest, rClause]);
}

export async function hashRho(actionHash: bigint, clauseCom: bigint, nOld: bigint, cNew: bigint): Promise<bigint> {
  return poseidonHash([TAGS.TAG_RHO, actionHash, clauseCom, nOld, cNew]);
}

export async function hashMerkleNode(left: bigint, right: bigint): Promise<bigint> {
  return poseidonHash([left, right]);
}
