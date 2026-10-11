import { assertFr, frToDecimal, parseFr } from "../crypto/fr.ts";
import { hashMerkleNode } from "../crypto/hashObjects.ts";
import type { MerkleWitness, SerializedMerkleWitness } from "./merkleTypes.ts";

export const MOCK_AUTHORITY_TREE_DEPTH = 8;

function assertDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth <= 0 || depth > 30) {
    throw new Error(`Invalid fixed Merkle tree depth: ${depth}`);
  }
}

function assertIndex(depth: number, index: number): void {
  const capacity = 1 << depth;
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    throw new Error(`Merkle leaf index ${index} is outside [0, ${capacity})`);
  }
}

export async function buildZeroSchedule(depth: number): Promise<bigint[]> {
  assertDepth(depth);
  const zeroes: bigint[] = [0n];
  for (let i = 0; i < depth; i += 1) {
    zeroes.push(await hashMerkleNode(zeroes[i], zeroes[i]));
  }
  return zeroes;
}

export function serializeMerkleWitness(witness: MerkleWitness): SerializedMerkleWitness {
  return {
    leaf: frToDecimal(witness.leaf),
    index: witness.index,
    siblings: witness.siblings.map(frToDecimal),
    pathIndices: [...witness.pathIndices],
    root: frToDecimal(witness.root),
  };
}

export function deserializeMerkleWitness(witness: SerializedMerkleWitness): MerkleWitness {
  return {
    leaf: parseFr(witness.leaf),
    index: witness.index,
    siblings: witness.siblings.map(parseFr),
    pathIndices: [...witness.pathIndices],
    root: parseFr(witness.root),
  };
}

export class FixedMerkleTree {
  public readonly depth: number;
  public readonly capacity: number;
  private readonly zeroes: bigint[];
  private layers: bigint[][];

  private constructor(depth: number, zeroes: bigint[], layers: bigint[][]) {
    this.depth = depth;
    this.capacity = 1 << depth;
    this.zeroes = zeroes;
    this.layers = layers;
  }

  static async create(depth: number, leaves: bigint[] = []): Promise<FixedMerkleTree> {
    assertDepth(depth);
    const capacity = 1 << depth;
    if (leaves.length > capacity) {
      throw new Error(`Too many leaves: got ${leaves.length}, capacity is ${capacity}`);
    }
    const zeroes = await buildZeroSchedule(depth);
    const normalizedLeaves = Array.from({ length: capacity }, (_, i) =>
      i < leaves.length ? assertFr(leaves[i]) : zeroes[0],
    );
    const layers: bigint[][] = [normalizedLeaves];
    for (let level = 0; level < depth; level += 1) {
      const prev = layers[level];
      const next: bigint[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        next.push(await hashMerkleNode(prev[i], prev[i + 1]));
      }
      layers.push(next);
    }
    return new FixedMerkleTree(depth, zeroes, layers);
  }

  root(): bigint {
    return this.layers[this.depth][0];
  }

  leaf(index: number): bigint {
    assertIndex(this.depth, index);
    return this.layers[0][index];
  }

  async setLeaf(index: number, leaf: bigint): Promise<void> {
    assertIndex(this.depth, index);
    this.layers[0][index] = assertFr(leaf);
    let curIndex = index;
    for (let level = 0; level < this.depth; level += 1) {
      const parentIndex = Math.floor(curIndex / 2);
      const left = this.layers[level][parentIndex * 2];
      const right = this.layers[level][parentIndex * 2 + 1];
      this.layers[level + 1][parentIndex] = await hashMerkleNode(left, right);
      curIndex = parentIndex;
    }
  }

  getWitness(index: number): MerkleWitness {
    assertIndex(this.depth, index);
    const siblings: bigint[] = [];
    const pathIndices: number[] = [];
    let curIndex = index;
    for (let level = 0; level < this.depth; level += 1) {
      const isRight = curIndex % 2;
      pathIndices.push(isRight);
      const siblingIndex = isRight === 0 ? curIndex + 1 : curIndex - 1;
      siblings.push(this.layers[level][siblingIndex] ?? this.zeroes[level]);
      curIndex = Math.floor(curIndex / 2);
    }
    return {
      leaf: this.leaf(index),
      index,
      siblings,
      pathIndices,
      root: this.root(),
    };
  }

  async verifyWitness(witness: MerkleWitness): Promise<boolean> {
    return verifyMerkleWitness(witness, this.depth);
  }
}

export async function buildFixedMerkleTree(depth: number, leaves: bigint[] = []): Promise<FixedMerkleTree> {
  return FixedMerkleTree.create(depth, leaves);
}

export function getMerkleWitness(tree: FixedMerkleTree, index: number): MerkleWitness {
  return tree.getWitness(index);
}

export async function verifyMerkleWitness(witness: MerkleWitness, depth = witness.siblings.length): Promise<boolean> {
  try {
    assertDepth(depth);
    assertIndex(depth, witness.index);
    assertFr(witness.leaf);
    assertFr(witness.root);
    if (witness.siblings.length !== depth || witness.pathIndices.length !== depth) {
      return false;
    }
    let cur = witness.leaf;
    for (let level = 0; level < depth; level += 1) {
      const pathBit = witness.pathIndices[level];
      if (pathBit !== 0 && pathBit !== 1) {
        return false;
      }
      if (pathBit !== ((witness.index >> level) & 1)) {
        return false;
      }
      const sibling = assertFr(witness.siblings[level]);
      cur = pathBit === 0 ? await hashMerkleNode(cur, sibling) : await hashMerkleNode(sibling, cur);
    }
    return cur === witness.root;
  } catch {
    return false;
  }
}
