export interface StateWitness {
  leaf: bigint;
  index: number;
  siblings: bigint[];
  pathIndices: number[];
  root: bigint;
}

export interface StateAppendResult {
  index: number;
  leaf: bigint;
  oldRoot: bigint;
  newRoot: bigint;
}

export interface StateLeafInput {
  label: string;
  usedAmount: string;
  txCount: string;
  riskLevel: string;
  flags: string;
  r: string;
}
