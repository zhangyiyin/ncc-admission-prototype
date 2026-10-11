import { parseFr } from "../common/crypto/fr.ts";
import { hashPolicyLeaf, hashPolicyParams, hashPolicyScope } from "../common/crypto/hashObjects.ts";
import { FixedMerkleTree, MOCK_AUTHORITY_TREE_DEPTH } from "../common/merkle/fixedMerkleTree.ts";
import type { MerkleWitness } from "../common/merkle/merkleTypes.ts";

export interface DemoPolicy {
  policyName: string;
  e: string;
  policyID: string;
  gatewayID: string;
  policyVersion: string;
  limit: string;
  threshold: string;
  clauseType: string;
}

export interface PolicyEntry {
  policyName: string;
  e: bigint;
  policyID: bigint;
  gatewayID: bigint;
  policyVersion: bigint;
  limit: bigint;
  threshold: bigint;
  clauseType: bigint;
  policyScopeHash: bigint;
  policyParamsHash: bigint;
  leaf: bigint;
  index: number;
  witness: MerkleWitness;
}

export interface PolicyTreeResult {
  rootPolAct: bigint;
  tree: FixedMerkleTree;
  entries: PolicyEntry[];
}

export async function buildMockPolicyTree(
  policies: DemoPolicy[],
  depth = MOCK_AUTHORITY_TREE_DEPTH,
): Promise<PolicyTreeResult> {
  const leaves: bigint[] = [];
  const partialEntries: Omit<PolicyEntry, "witness">[] = [];
  for (let index = 0; index < policies.length; index += 1) {
    const policy = policies[index];
    const e = parseFr(policy.e);
    const policyID = parseFr(policy.policyID);
    const gatewayID = parseFr(policy.gatewayID);
    const policyVersion = parseFr(policy.policyVersion);
    const limit = parseFr(policy.limit);
    const threshold = parseFr(policy.threshold);
    const clauseType = parseFr(policy.clauseType);
    const policyScopeHash = await hashPolicyScope(e, policyID, gatewayID, policyVersion);
    const policyParamsHash = await hashPolicyParams(limit, threshold, clauseType);
    const leaf = await hashPolicyLeaf(policyScopeHash, policyParamsHash);
    leaves[index] = leaf;
    partialEntries.push({ policyName: policy.policyName, e, policyID, gatewayID, policyVersion, limit, threshold, clauseType, policyScopeHash, policyParamsHash, leaf, index });
  }
  const tree = await FixedMerkleTree.create(depth, leaves);
  return {
    rootPolAct: tree.root(),
    tree,
    entries: partialEntries.map((entry) => ({ ...entry, witness: tree.getWitness(entry.index) })),
  };
}
