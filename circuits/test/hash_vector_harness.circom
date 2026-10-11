pragma circom 2.1.6;

include "../lib/hash_helpers.circom";

template HashVectorHarness() {
    signal input sk_u;
    signal input e;
    signal input policyID;
    signal input gatewayID;
    signal input policyVersion;
    signal input regScope;
    signal input regSalt;
    signal input statusActive;
    signal input statusSalt;
    signal input limit;
    signal input threshold;
    signal input clauseType;
    signal input category;
    signal input chainID;
    signal input contractAddr;
    signal input nonce1;
    signal input nonce2;
    signal input receiverDigest;
    signal input risk0;
    signal input flags0;
    signal input rGen;
    signal input rState1;
    signal input rState2;
    signal input rAmt1;
    signal input rAmt2;
    signal input rClauseDummy;
    signal input rClauseSatisfied;
    signal input evidenceSaltDummy;
    signal input evidenceSaltSatisfied;
    signal input amount1;
    signal input amount2;

    signal output owner;
    signal output scopeHash;
    signal output policyScopeHash;
    signal output stateCoreHashGen;
    signal output stateCoreHash1;
    signal output stateCoreHash2;
    signal output C_gen;
    signal output C_state1;
    signal output C_state2;
    signal output amountCom1;
    signal output amountCom2;
    signal output N_gen;
    signal output N_old;
    signal output regLeaf;
    signal output statusLeaf;
    signal output policyParamsHash;
    signal output policyLeaf;
    signal output actionContextHash1;
    signal output actionHash1;
    signal output evidenceDigestDummy;
    signal output evidenceDigestSatisfied;
    signal output clauseComDummy;
    signal output clauseComSatisfied;
    signal output rho1;
    signal output merkleNode;
    signal output zero1;
    signal output zero2;
    signal output zero3;

    component hOwner = HashOwner();
    hOwner.sk_u <== sk_u;
    owner <== hOwner.out;

    component hScope = HashScope();
    hScope.e <== e;
    hScope.policyID <== policyID;
    hScope.gatewayID <== gatewayID;
    scopeHash <== hScope.out;

    component hPolicyScope = HashPolicyScope();
    hPolicyScope.e <== e;
    hPolicyScope.policyID <== policyID;
    hPolicyScope.gatewayID <== gatewayID;
    hPolicyScope.policyVersion <== policyVersion;
    policyScopeHash <== hPolicyScope.out;

    component hStateCoreGen = HashStateCore();
    hStateCoreGen.usedAmount <== 0;
    hStateCoreGen.txCount <== 0;
    hStateCoreGen.riskLevel <== risk0;
    hStateCoreGen.flags <== flags0;
    stateCoreHashGen <== hStateCoreGen.out;

    component hCGen = HashState();
    hCGen.owner <== owner;
    hCGen.scopeHash <== scopeHash;
    hCGen.stateCoreHash <== stateCoreHashGen;
    hCGen.r <== rGen;
    C_gen <== hCGen.out;

    component hStateCore1 = HashStateCore();
    hStateCore1.usedAmount <== amount1;
    hStateCore1.txCount <== 1;
    hStateCore1.riskLevel <== risk0;
    hStateCore1.flags <== flags0;
    stateCoreHash1 <== hStateCore1.out;

    component hC1 = HashState();
    hC1.owner <== owner;
    hC1.scopeHash <== scopeHash;
    hC1.stateCoreHash <== stateCoreHash1;
    hC1.r <== rState1;
    C_state1 <== hC1.out;

    component hStateCore2 = HashStateCore();
    hStateCore2.usedAmount <== amount1 + amount2;
    hStateCore2.txCount <== 2;
    hStateCore2.riskLevel <== risk0;
    hStateCore2.flags <== flags0;
    stateCoreHash2 <== hStateCore2.out;

    component hC2 = HashState();
    hC2.owner <== owner;
    hC2.scopeHash <== scopeHash;
    hC2.stateCoreHash <== stateCoreHash2;
    hC2.r <== rState2;
    C_state2 <== hC2.out;

    component hAmount1 = HashAmount();
    hAmount1.amount <== amount1;
    hAmount1.r_amt <== rAmt1;
    hAmount1.scopeHash <== scopeHash;
    hAmount1.nonce <== nonce1;
    amountCom1 <== hAmount1.out;

    component hAmount2 = HashAmount();
    hAmount2.amount <== amount2;
    hAmount2.r_amt <== rAmt2;
    hAmount2.scopeHash <== scopeHash;
    hAmount2.nonce <== nonce2;
    amountCom2 <== hAmount2.out;

    component hNGen = HashGenesisNullifier();
    hNGen.sk_u <== sk_u;
    hNGen.scopeHash <== scopeHash;
    N_gen <== hNGen.out;

    component hNOld = HashStateNullifier();
    hNOld.sk_u <== sk_u;
    hNOld.C_old <== C_gen;
    hNOld.scopeHash <== scopeHash;
    N_old <== hNOld.out;

    component hReg = HashRegLeaf();
    hReg.owner <== owner;
    hReg.regScope <== regScope;
    hReg.regSalt <== regSalt;
    regLeaf <== hReg.out;

    component hStatus = HashStatusLeaf();
    hStatus.owner <== owner;
    hStatus.statusActive <== statusActive;
    hStatus.e <== e;
    hStatus.statusSalt <== statusSalt;
    statusLeaf <== hStatus.out;

    component hPolicyParams = HashPolicyParams();
    hPolicyParams.limit <== limit;
    hPolicyParams.threshold <== threshold;
    hPolicyParams.clauseType <== clauseType;
    policyParamsHash <== hPolicyParams.out;

    component hPolicyLeaf = HashPolicyLeaf();
    hPolicyLeaf.policyScopeHash <== policyScopeHash;
    hPolicyLeaf.policyParamsHash <== policyParamsHash;
    policyLeaf <== hPolicyLeaf.out;

    component hActionContext = HashActionContext();
    hActionContext.category <== category;
    hActionContext.chainID <== chainID;
    hActionContext.contractAddr <== contractAddr;
    hActionContext.nonce <== nonce1;
    hActionContext.receiverDigest <== receiverDigest;
    actionContextHash1 <== hActionContext.out;

    component hAction = HashAction();
    hAction.scopeHash <== scopeHash;
    hAction.amountCom <== amountCom1;
    hAction.actionContextHash <== actionContextHash1;
    actionHash1 <== hAction.out;

    component hEvidenceDummy = HashMockSofEvidence();
    hEvidenceDummy.scopeHash <== scopeHash;
    hEvidenceDummy.nonce <== nonce1;
    hEvidenceDummy.evidenceSalt <== evidenceSaltDummy;
    evidenceDigestDummy <== hEvidenceDummy.out;

    component hEvidenceSatisfied = HashMockSofEvidence();
    hEvidenceSatisfied.scopeHash <== scopeHash;
    hEvidenceSatisfied.nonce <== nonce2;
    hEvidenceSatisfied.evidenceSalt <== evidenceSaltSatisfied;
    evidenceDigestSatisfied <== hEvidenceSatisfied.out;

    component hClauseDummy = HashClause();
    hClauseDummy.actionHash <== actionHash1;
    hClauseDummy.clauseType <== clauseType;
    hClauseDummy.clauseStatus <== 0;
    hClauseDummy.evidenceDigest <== evidenceDigestDummy;
    hClauseDummy.r_clause <== rClauseDummy;
    clauseComDummy <== hClauseDummy.out;

    component hClauseSatisfied = HashClause();
    hClauseSatisfied.actionHash <== actionHash1;
    hClauseSatisfied.clauseType <== clauseType;
    hClauseSatisfied.clauseStatus <== 1;
    hClauseSatisfied.evidenceDigest <== evidenceDigestSatisfied;
    hClauseSatisfied.r_clause <== rClauseSatisfied;
    clauseComSatisfied <== hClauseSatisfied.out;

    component hRho = HashRho();
    hRho.actionHash <== actionHash1;
    hRho.clauseCom <== clauseComDummy;
    hRho.N_old <== N_old;
    hRho.C_new <== C_state1;
    rho1 <== hRho.out;

    component hNode = HashMerkleNode();
    hNode.left <== C_gen;
    hNode.right <== C_state1;
    merkleNode <== hNode.out;

    component hZero1 = HashMerkleNode();
    hZero1.left <== 0;
    hZero1.right <== 0;
    zero1 <== hZero1.out;

    component hZero2 = HashMerkleNode();
    hZero2.left <== zero1;
    hZero2.right <== zero1;
    zero2 <== hZero2.out;

    component hZero3 = HashMerkleNode();
    hZero3.left <== zero2;
    hZero3.right <== zero2;
    zero3 <== hZero3.out;
}

component main { public [
  sk_u,
  e,
  policyID,
  gatewayID,
  policyVersion,
  regScope,
  regSalt,
  statusActive,
  statusSalt,
  limit,
  threshold,
  clauseType,
  category,
  chainID,
  contractAddr,
  nonce1,
  nonce2,
  receiverDigest,
  risk0,
  flags0,
  rGen,
  rState1,
  rState2,
  rAmt1,
  rAmt2,
  rClauseDummy,
  rClauseSatisfied,
  evidenceSaltDummy,
  evidenceSaltSatisfied,
  amount1,
  amount2
] } = HashVectorHarness();
