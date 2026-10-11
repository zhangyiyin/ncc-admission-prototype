import { addressToFr, chainIdToFr, uintToFr } from "./encoding.ts";
import { assertFr, frToDecimal, parseFr } from "./fr.ts";
import * as H from "./hashObjects.ts";
import { poseidonHash } from "./poseidon.ts";
import { CLAUSE, TAGS } from "./tags.ts";

export interface RawHashInputs {
  [key: string]: string;
}

export interface HashVectors {
  schema: string;
  tags: Record<string, string>;
  clauseStatus: Record<string, string>;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  initPublicInputs: string[];
  updatePublicInputs: string[];
  negative: Record<string, string>;
}

function dec(x: bigint): string {
  return frToDecimal(x);
}

function parseInput(raw: RawHashInputs, key: string): bigint {
  if (!(key in raw)) {
    throw new Error(`Missing hash input: ${key}`);
  }
  return parseFr(raw[key]);
}

export function normalizeInputs(raw: RawHashInputs): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const key of [
    "sk_u", "e", "policyID", "gatewayID", "policyVersion", "regScope", "regSalt",
    "statusActive", "statusSalt", "limit", "threshold", "clauseType", "category",
    "chainID", "nonce1", "nonce2", "receiverDigest", "risk0", "flags0", "rGen",
    "rState1", "rState2", "rAmt1", "rAmt2", "rClauseDummy", "rClauseSatisfied",
    "evidenceSaltDummy", "evidenceSaltSatisfied", "amount1", "amount2",
    "rootRegAct", "rootStatusAct", "rootPolAct", "rtState"
  ]) {
    out[key] = parseInput(raw, key);
  }

  out.contractAddr = addressToFr(raw.contractAddr);

  uintToFr(out.amount1, 64);
  uintToFr(out.amount2, 64);
  uintToFr(out.limit, 64);
  uintToFr(out.threshold, 64);
  uintToFr(out.risk0, 32);
  uintToFr(out.flags0, 32);
  uintToFr(0n, 32);
  chainIdToFr(out.chainID);

  return out;
}

export async function generateHashVectors(raw: RawHashInputs): Promise<HashVectors> {
  const i = normalizeInputs(raw);

  const owner = await H.hashOwner(i.sk_u);
  const scopeHash = await H.hashScope(i.e, i.policyID, i.gatewayID);
  const policyScopeHash = await H.hashPolicyScope(i.e, i.policyID, i.gatewayID, i.policyVersion);
  const stateCoreHashGen = await H.hashStateCore(0n, 0n, i.risk0, i.flags0);
  const C_gen = await H.hashState(owner, scopeHash, stateCoreHashGen, i.rGen);

  const stateCoreHash1 = await H.hashStateCore(i.amount1, 1n, i.risk0, i.flags0);
  const C_state1 = await H.hashState(owner, scopeHash, stateCoreHash1, i.rState1);
  const stateCoreHash2 = await H.hashStateCore(i.amount1 + i.amount2, 2n, i.risk0, i.flags0);
  const C_state2 = await H.hashState(owner, scopeHash, stateCoreHash2, i.rState2);

  const amountCom1 = await H.hashAmount(i.amount1, i.rAmt1, scopeHash, i.nonce1);
  const amountCom2 = await H.hashAmount(i.amount2, i.rAmt2, scopeHash, i.nonce2);
  const N_gen = await H.hashGenesisNullifier(i.sk_u, scopeHash);
  const N_old = await H.hashStateNullifier(i.sk_u, C_gen, scopeHash);
  const regLeaf = await H.hashRegLeaf(owner, i.regScope, i.regSalt);
  const statusLeaf = await H.hashStatusLeaf(owner, i.statusActive, i.e, i.statusSalt);
  const policyParamsHash = await H.hashPolicyParams(i.limit, i.threshold, i.clauseType);
  const policyLeaf = await H.hashPolicyLeaf(policyScopeHash, policyParamsHash);
  const actionContextHash1 = await H.hashActionContext(i.category, i.chainID, i.contractAddr, i.nonce1, i.receiverDigest);
  const actionHash1 = await H.hashAction(scopeHash, amountCom1, actionContextHash1);
  const evidenceDigestDummy = await H.hashMockSofEvidence(scopeHash, i.nonce1, i.evidenceSaltDummy);
  const evidenceDigestSatisfied = await H.hashMockSofEvidence(scopeHash, i.nonce2, i.evidenceSaltSatisfied);
  const clauseComDummy = await H.hashClause(actionHash1, i.clauseType, CLAUSE.CLAUSE_DUMMY, evidenceDigestDummy, i.rClauseDummy);
  const clauseComSatisfied = await H.hashClause(actionHash1, i.clauseType, CLAUSE.CLAUSE_SATISFIED, evidenceDigestSatisfied, i.rClauseSatisfied);
  const rho1 = await H.hashRho(actionHash1, clauseComDummy, N_old, C_state1);
  const merkleNode = await H.hashMerkleNode(C_gen, C_state1);
  const zero1 = await H.hashMerkleNode(0n, 0n);
  const zero2 = await H.hashMerkleNode(zero1, zero1);
  const zero3 = await H.hashMerkleNode(zero2, zero2);

  const amountComSwapped = await poseidonHash([TAGS.TAG_AMOUNT, i.rAmt1, i.amount1, scopeHash, i.nonce1]);
  const policyLeafSwapped = await poseidonHash([TAGS.TAG_POLICY_LEAF, policyParamsHash, policyScopeHash]);
  const actionContextSwapped = await poseidonHash([TAGS.TAG_ACTION_CONTEXT, i.category, i.chainID, i.contractAddr, i.receiverDigest, i.nonce1]);
  const actionHashSwapped = await poseidonHash([TAGS.TAG_ACTION, amountCom1, scopeHash, actionContextHash1]);
  const rhoSwapped = await poseidonHash([TAGS.TAG_RHO, clauseComDummy, actionHash1, N_old, C_state1]);

  const outputs: Record<string, bigint> = {
    owner,
    scopeHash,
    policyScopeHash,
    stateCoreHashGen,
    stateCoreHash1,
    stateCoreHash2,
    C_gen,
    C_state1,
    C_state2,
    amountCom1,
    amountCom2,
    N_gen,
    N_old,
    regLeaf,
    statusLeaf,
    policyParamsHash,
    policyLeaf,
    actionContextHash1,
    actionHash1,
    evidenceDigestDummy,
    evidenceDigestSatisfied,
    clauseComDummy,
    clauseComSatisfied,
    rho1,
    merkleNode,
    zero1,
    zero2,
    zero3,
  };

  for (const [key, value] of Object.entries(outputs)) {
    assertFr(value);
  }

  const inputStrings: Record<string, string> = {};
  for (const [key, value] of Object.entries(i)) {
    inputStrings[key] = dec(value);
  }

  return {
    schema: "m1-r2.hash-vectors.v1",
    tags: Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [k, dec(v)])),
    clauseStatus: Object.fromEntries(Object.entries(CLAUSE).map(([k, v]) => [k, dec(v)])),
    inputs: inputStrings,
    outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, dec(v)])),
    initPublicInputs: [i.rootRegAct, i.rootStatusAct, i.rootPolAct, N_gen, C_gen, policyScopeHash].map(dec),
    updatePublicInputs: [i.rootRegAct, i.rootStatusAct, i.rootPolAct, i.rtState, N_old, C_state1, actionHash1, amountCom1, clauseComDummy, rho1].map(dec),
    negative: {
      amountComSwapped: dec(amountComSwapped),
      policyLeafSwapped: dec(policyLeafSwapped),
      actionContextSwapped: dec(actionContextSwapped),
      actionHashSwapped: dec(actionHashSwapped),
      rhoSwapped: dec(rhoSwapped),
    },
  };
}
