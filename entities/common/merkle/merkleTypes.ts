export interface MerkleWitness {
  leaf: bigint;
  index: number;
  siblings: bigint[];
  pathIndices: number[];
  root: bigint;
}

export interface SerializedMerkleWitness {
  leaf: string;
  index: number;
  siblings: string[];
  pathIndices: number[];
  root: string;
}
