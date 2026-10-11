import { parseFr } from "../common/crypto/fr.ts";
import { hashOwner, hashStatusLeaf } from "../common/crypto/hashObjects.ts";
import { FixedMerkleTree, MOCK_AUTHORITY_TREE_DEPTH } from "../common/merkle/fixedMerkleTree.ts";
import type { MerkleWitness } from "../common/merkle/merkleTypes.ts";
import type { DemoUserPrivate } from "../registration_authority/mockRegistrationTree.ts";

export interface StatusEntry {
  userID: string;
  owner: bigint;
  statusActive: bigint;
  e: bigint;
  statusSalt: bigint;
  leaf: bigint;
  index: number;
  witness: MerkleWitness;
}

export interface StatusTreeResult {
  rootStatusAct: bigint;
  tree: FixedMerkleTree;
  entries: StatusEntry[];
}

export async function buildMockStatusTree(
  users: DemoUserPrivate[],
  e: bigint,
  depth = MOCK_AUTHORITY_TREE_DEPTH,
): Promise<StatusTreeResult> {
  const leaves: bigint[] = [];
  const partialEntries: Omit<StatusEntry, "witness">[] = [];
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    const owner = await hashOwner(parseFr(user.sk_u));
    const statusActive = parseFr(user.statusActive);
    const statusSalt = parseFr(user.statusSalt);
    const leaf = await hashStatusLeaf(owner, statusActive, e, statusSalt);
    leaves[index] = leaf;
    partialEntries.push({ userID: user.userID, owner, statusActive, e, statusSalt, leaf, index });
  }
  const tree = await FixedMerkleTree.create(depth, leaves);
  return {
    rootStatusAct: tree.root(),
    tree,
    entries: partialEntries.map((entry) => ({ ...entry, witness: tree.getWitness(entry.index) })),
  };
}
