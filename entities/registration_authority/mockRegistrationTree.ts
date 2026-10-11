import { parseFr } from "../common/crypto/fr.ts";
import { hashOwner, hashRegLeaf } from "../common/crypto/hashObjects.ts";
import { FixedMerkleTree, MOCK_AUTHORITY_TREE_DEPTH } from "../common/merkle/fixedMerkleTree.ts";
import type { MerkleWitness } from "../common/merkle/merkleTypes.ts";

export interface DemoUserPrivate {
  userID: string;
  sk_u: string;
  regSalt: string;
  statusSalt: string;
  statusActive: string;
}

export interface RegistrationEntry {
  userID: string;
  owner: bigint;
  regScope: bigint;
  regSalt: bigint;
  leaf: bigint;
  index: number;
  witness: MerkleWitness;
}

export interface RegistrationTreeResult {
  rootRegAct: bigint;
  tree: FixedMerkleTree;
  entries: RegistrationEntry[];
}

export async function buildMockRegistrationTree(
  users: DemoUserPrivate[],
  scopeHash: bigint,
  depth = MOCK_AUTHORITY_TREE_DEPTH,
): Promise<RegistrationTreeResult> {
  const leaves: bigint[] = [];
  const partialEntries: Omit<RegistrationEntry, "witness">[] = [];
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    const skU = parseFr(user.sk_u);
    const owner = await hashOwner(skU);
    const regSalt = parseFr(user.regSalt);
    const leaf = await hashRegLeaf(owner, scopeHash, regSalt);
    leaves[index] = leaf;
    partialEntries.push({ userID: user.userID, owner, regScope: scopeHash, regSalt, leaf, index });
  }
  const tree = await FixedMerkleTree.create(depth, leaves);
  return {
    rootRegAct: tree.root(),
    tree,
    entries: partialEntries.map((entry) => ({ ...entry, witness: tree.getWitness(entry.index) })),
  };
}
