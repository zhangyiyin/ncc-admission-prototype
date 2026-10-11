import { assertFr } from "../../common/crypto/fr.ts";
import { hashMerkleNode } from "../../common/crypto/hashObjects.ts";
import type { StateAppendResult, StateWitness } from "./stateTreeTypes.ts";

export class OffchainStateTree {
  private readonly treeDepth: number;
  private readonly zeroes: bigint[];
  private readonly leaves: bigint[] = [];
  private currentRoot: bigint;
  private readonly rootHistory: bigint[];

  private constructor(depth: number, zeroes: bigint[]) {
    if (!Number.isInteger(depth) || depth <= 0 || depth > 32) {
      throw new Error(`Invalid state tree depth: ${depth}`);
    }
    this.treeDepth = depth;
    this.zeroes = zeroes;
    this.currentRoot = zeroes[depth];
    this.rootHistory = [this.currentRoot];
  }

  static async create(depth: number): Promise<OffchainStateTree> {
    const zeroes: bigint[] = [0n];
    for (let i = 0; i < depth; i += 1) {
      zeroes.push(await hashMerkleNode(zeroes[i], zeroes[i]));
    }
    return new OffchainStateTree(depth, zeroes);
  }

  depth(): number {
    return this.treeDepth;
  }

  size(): number {
    return this.leaves.length;
  }

  capacity(): number {
    return 2 ** this.treeDepth;
  }

  zero(level: number): bigint {
    if (!Number.isInteger(level) || level < 0 || level > this.treeDepth) {
      throw new Error(`Invalid zero level: ${level}`);
    }
    return this.zeroes[level];
  }

  zeroSchedule(): bigint[] {
    return [...this.zeroes];
  }

  root(): bigint {
    return this.currentRoot;
  }

  async append(leaf: bigint): Promise<StateAppendResult> {
    assertFr(leaf);
    if (this.leaves.length >= this.capacity()) {
      throw new Error("State tree is full");
    }
    const index = this.leaves.length;
    const oldRoot = this.currentRoot;
    this.leaves.push(leaf);
    this.currentRoot = await this.computeRootFromLeaves();
    this.rootHistory.push(this.currentRoot);
    return {
      index,
      leaf,
      oldRoot,
      newRoot: this.currentRoot,
    };
  }

  getLeaf(index: number): bigint {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index out of range: ${index}`);
    }
    return this.leaves[index];
  }

  async getWitness(index: number): Promise<StateWitness> {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index out of range: ${index}`);
    }

    let levelNodes = this.paddedLeaves();
    let curIndex = index;
    const siblings: bigint[] = [];
    const pathIndices: number[] = [];

    for (let level = 0; level < this.treeDepth; level += 1) {
      const isRight = curIndex % 2 === 1;
      const siblingIndex = isRight ? curIndex - 1 : curIndex + 1;
      siblings.push(levelNodes[siblingIndex]);
      pathIndices.push(isRight ? 1 : 0);

      const nextLevel: bigint[] = [];
      for (let i = 0; i < levelNodes.length; i += 2) {
        nextLevel.push(await hashMerkleNode(levelNodes[i], levelNodes[i + 1]));
      }
      levelNodes = nextLevel;
      curIndex = Math.floor(curIndex / 2);
    }

    return {
      leaf: this.leaves[index],
      index,
      siblings,
      pathIndices,
      root: this.currentRoot,
    };
  }

  async verifyWitness(witness: StateWitness): Promise<boolean> {
    if (witness.siblings.length !== this.treeDepth || witness.pathIndices.length !== this.treeDepth) {
      return false;
    }
    return OffchainStateTree.verifyWitnessAtDepth(this.treeDepth, witness);
  }

  static async verifyWitnessAtDepth(depth: number, witness: StateWitness): Promise<boolean> {
    if (witness.siblings.length !== depth || witness.pathIndices.length !== depth) {
      return false;
    }
    try {
      let cur = assertFr(witness.leaf);
      for (let i = 0; i < depth; i += 1) {
        const sibling = assertFr(witness.siblings[i]);
        const bit = witness.pathIndices[i];
        if (bit === 0) {
          cur = await hashMerkleNode(cur, sibling);
        } else if (bit === 1) {
          cur = await hashMerkleNode(sibling, cur);
        } else {
          return false;
        }
      }
      return cur === assertFr(witness.root);
    } catch {
      return false;
    }
  }

  isKnownRoot(root: bigint): boolean {
    return this.rootHistory.some((r) => r === root);
  }

  knownRoots(): bigint[] {
    return [...this.rootHistory];
  }

  private paddedLeaves(): bigint[] {
    const out = [...this.leaves];
    while (out.length < this.capacity()) {
      out.push(this.zeroes[0]);
    }
    return out;
  }

  private async computeRootFromLeaves(): Promise<bigint> {
    let levelNodes = this.paddedLeaves();
    for (let level = 0; level < this.treeDepth; level += 1) {
      const nextLevel: bigint[] = [];
      for (let i = 0; i < levelNodes.length; i += 2) {
        nextLevel.push(await hashMerkleNode(levelNodes[i], levelNodes[i + 1]));
      }
      levelNodes = nextLevel;
    }
    if (levelNodes.length !== 1) {
      throw new Error("State tree root computation failed");
    }
    return levelNodes[0];
  }
}
