export type GatewayScope = {
  e: string;
  policyID: string;
  gatewayID: string;
};

export type GatewayExecutionFields = {
  amount: string;
  rAmt: string;
  nonce: string;
  category: string;
  chainID: string;
  contractAddr: string;
  receiverDigest: string;
};

export type GatewayExpectedPublic = {
  amountCom: string;
  actionHash: string;
  clauseCom: string;
  C_new: string;
  N_old: string;
  rtState: string;
};

export type GatewayExecutionPackage = {
  label: string;
  rho: string;
  scope: GatewayScope;
  execution: GatewayExecutionFields;
  expectedPublic: GatewayExpectedPublic;
};

export type GatewayDigests = {
  scopeHash: bigint;
  amountCom: bigint;
  actionContextHash: bigint;
  actionHash: bigint;
};

export type AcceptedRecordLike = {
  exists: boolean;
  rho: string | bigint;
  N_old: string | bigint;
  C_new: string | bigint;
  rtState: string | bigint;
  newStateRoot?: string | bigint;
  actionHash: string | bigint;
  amountCom: string | bigint;
  clauseCom: string | bigint;
  stateIndex?: string | bigint;
};

export type GatewayCheckResult = {
  accepted: boolean;
  checks: {
    recordExists: boolean;
    rhoMatches: boolean;
    amountComMatches: boolean;
    actionHashMatches: boolean;
    clauseComMatches: boolean;
    cNewMatches: boolean;
    nOldMatches: boolean;
    rtStateMatches: boolean;
  };
  failures: string[];
};

export type GatewayReceipt = {
  label: string;
  rho: string;
  accepted: boolean;
  checks: GatewayCheckResult["checks"];
  record: {
    rho: string;
    N_old: string;
    C_new: string;
    rtState: string;
    newStateRoot: string;
    stateIndex: string;
    actionHash: string;
    amountCom: string;
    clauseCom: string;
  };
  privateExecution: {
    amount: string;
    receiverDigest: string;
  };
};
