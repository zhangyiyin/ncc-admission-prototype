pragma circom 2.1.6;

include "../lib/merkle_poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template UpdateComplianceStateFull(depth) {
    // Final update public input ordering. This is unchanged from M6.
    signal input rootRegAct;
    signal input rootStatusAct;
    signal input rootPolAct;
    signal input rtState;
    signal input N_old;
    signal input C_new;
    signal input actionHash;
    signal input amountCom;
    signal input clauseCom;
    signal input rho;

    // Private inputs inherited from M5/M6.
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

    signal input amount;
    signal input rAmt;
    signal input nonce;

    signal input usedAmountOld;
    signal input txCountOld;
    signal input riskLevelOld;
    signal input flagsOld;
    signal input rOld;

    signal input usedAmountNew;
    signal input txCountNew;
    signal input riskLevelNew;
    signal input flagsNew;
    signal input rNew;

    signal input regSiblings[depth];
    signal input regPathIndices[depth];

    signal input statusSiblings[depth];
    signal input statusPathIndices[depth];

    signal input policySiblings[depth];
    signal input policyPathIndices[depth];

    signal input stateSiblings[depth];
    signal input statePathIndices[depth];

    // Action context witness fields inherited from M6.
    signal input category;
    signal input chainID;
    signal input contractAddr;
    signal input receiverDigest;

    // Clause witness fields added in M7.
    signal input clauseStatus;
    signal input evidenceSalt;
    signal input rClause;

    // Range checks. These prevent field-wraparound based fake updates and
    // make comparison gadgets meaningful under the intended integer ranges.
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;

    component usedOldBits = Num2Bits(64);
    usedOldBits.in <== usedAmountOld;

    component usedNewBits = Num2Bits(64);
    usedNewBits.in <== usedAmountNew;

    component limitBits = Num2Bits(64);
    limitBits.in <== limit;

    component thresholdBits = Num2Bits(64);
    thresholdBits.in <== threshold;

    component txOldBits = Num2Bits(32);
    txOldBits.in <== txCountOld;

    component txNewBits = Num2Bits(32);
    txNewBits.in <== txCountNew;

    component riskOldBits = Num2Bits(32);
    riskOldBits.in <== riskLevelOld;

    component riskNewBits = Num2Bits(32);
    riskNewBits.in <== riskLevelNew;

    component flagsOldBits = Num2Bits(32);
    flagsOldBits.in <== flagsOld;

    component flagsNewBits = Num2Bits(32);
    flagsNewBits.in <== flagsNew;

    component categoryBits = Num2Bits(32);
    categoryBits.in <== category;

    component chainIDBits = Num2Bits(64);
    chainIDBits.in <== chainID;

    component contractAddrBits = Num2Bits(160);
    contractAddrBits.in <== contractAddr;

    // Owner and scope.
    component hOwner = HashOwner();
    hOwner.sk_u <== sk_u;

    component hScope = HashScope();
    hScope.e <== e;
    hScope.policyID <== policyID;
    hScope.gatewayID <== gatewayID;

    regScope === hScope.out;

    // Active registration membership.
    component hRegLeaf = HashRegLeaf();
    hRegLeaf.owner <== hOwner.out;
    hRegLeaf.regScope <== regScope;
    hRegLeaf.regSalt <== regSalt;

    component regRoot = MerkleRootPoseidon(depth);
    regRoot.leaf <== hRegLeaf.out;
    for (var i = 0; i < depth; i++) {
        regRoot.siblings[i] <== regSiblings[i];
        regRoot.pathIndices[i] <== regPathIndices[i];
    }
    regRoot.root === rootRegAct;

    // Active status membership.
    statusActive === 1;

    component hStatusLeaf = HashStatusLeaf();
    hStatusLeaf.owner <== hOwner.out;
    hStatusLeaf.statusActive <== statusActive;
    hStatusLeaf.e <== e;
    hStatusLeaf.statusSalt <== statusSalt;

    component statusRoot = MerkleRootPoseidon(depth);
    statusRoot.leaf <== hStatusLeaf.out;
    for (var j = 0; j < depth; j++) {
        statusRoot.siblings[j] <== statusSiblings[j];
        statusRoot.pathIndices[j] <== statusPathIndices[j];
    }
    statusRoot.root === rootStatusAct;

    // Active policy membership.
    component hPolicyScope = HashPolicyScope();
    hPolicyScope.e <== e;
    hPolicyScope.policyID <== policyID;
    hPolicyScope.gatewayID <== gatewayID;
    hPolicyScope.policyVersion <== policyVersion;

    component hPolicyParams = HashPolicyParams();
    hPolicyParams.limit <== limit;
    hPolicyParams.threshold <== threshold;
    hPolicyParams.clauseType <== clauseType;

    component hPolicyLeaf = HashPolicyLeaf();
    hPolicyLeaf.policyScopeHash <== hPolicyScope.out;
    hPolicyLeaf.policyParamsHash <== hPolicyParams.out;

    component policyRoot = MerkleRootPoseidon(depth);
    policyRoot.leaf <== hPolicyLeaf.out;
    for (var k = 0; k < depth; k++) {
        policyRoot.siblings[k] <== policySiblings[k];
        policyRoot.pathIndices[k] <== policyPathIndices[k];
    }
    policyRoot.root === rootPolAct;

    // Old hidden state commitment.
    component hStateCoreOld = HashStateCore();
    hStateCoreOld.usedAmount <== usedAmountOld;
    hStateCoreOld.txCount <== txCountOld;
    hStateCoreOld.riskLevel <== riskLevelOld;
    hStateCoreOld.flags <== flagsOld;

    component hCOld = HashState();
    hCOld.owner <== hOwner.out;
    hCOld.scopeHash <== hScope.out;
    hCOld.stateCoreHash <== hStateCoreOld.out;
    hCOld.r <== rOld;

    // Private old state membership under public historical state root.
    component stateRoot = MerkleRootPoseidon(depth);
    stateRoot.leaf <== hCOld.out;
    for (var s = 0; s < depth; s++) {
        stateRoot.siblings[s] <== stateSiblings[s];
        stateRoot.pathIndices[s] <== statePathIndices[s];
    }
    stateRoot.root === rtState;

    // State nullifier.
    component hNOld = HashStateNullifier();
    hNOld.sk_u <== sk_u;
    hNOld.C_old <== hCOld.out;
    hNOld.scopeHash <== hScope.out;
    hNOld.out === N_old;

    // Amount commitment. The same nonce is reused by actionContextHash.
    component hAmount = HashAmount();
    hAmount.amount <== amount;
    hAmount.r_amt <== rAmt;
    hAmount.scopeHash <== hScope.out;
    hAmount.nonce <== nonce;
    hAmount.out === amountCom;

    // Basic cumulative update inherited from M5.
    usedAmountNew === usedAmountOld + amount;
    txCountNew === txCountOld + 1;
    riskLevelNew === riskLevelOld;
    flagsNew === flagsOld;

    // Limit check using comparator, not field arithmetic alone.
    component usedAmountLeLimit = LessEqThan(64);
    usedAmountLeLimit.in[0] <== usedAmountNew;
    usedAmountLeLimit.in[1] <== limit;
    usedAmountLeLimit.out === 1;

    // New hidden state commitment.
    component hStateCoreNew = HashStateCore();
    hStateCoreNew.usedAmount <== usedAmountNew;
    hStateCoreNew.txCount <== txCountNew;
    hStateCoreNew.riskLevel <== riskLevelNew;
    hStateCoreNew.flags <== flagsNew;

    component hCNew = HashState();
    hCNew.owner <== hOwner.out;
    hCNew.scopeHash <== hScope.out;
    hCNew.stateCoreHash <== hStateCoreNew.out;
    hCNew.r <== rNew;
    hCNew.out === C_new;

    // Action binding inherited from M6.
    component hActionContext = HashActionContext();
    hActionContext.category <== category;
    hActionContext.chainID <== chainID;
    hActionContext.contractAddr <== contractAddr;
    hActionContext.nonce <== nonce;
    hActionContext.receiverDigest <== receiverDigest;

    component hAction = HashAction();
    hAction.scopeHash <== hScope.out;
    hAction.amountCom <== amountCom;
    hAction.actionContextHash <== hActionContext.out;
    hAction.out === actionHash;

    // M7 clause validation.
    component hEvidence = HashMockSofEvidence();
    hEvidence.scopeHash <== hScope.out;
    hEvidence.nonce <== nonce;
    hEvidence.evidenceSalt <== evidenceSalt;

    component hClause = HashClause();
    hClause.actionHash <== actionHash;
    hClause.clauseType <== clauseType;
    hClause.clauseStatus <== clauseStatus;
    hClause.evidenceDigest <== hEvidence.out;
    hClause.r_clause <== rClause;
    hClause.out === clauseCom;

    // overThreshold = 1 iff threshold < usedAmountNew, i.e. usedAmountNew > threshold.
    component overThreshold = LessThan(64);
    overThreshold.in[0] <== threshold;
    overThreshold.in[1] <== usedAmountNew;

    // Demo clause status rule:
    // usedAmountNew > threshold  => CLAUSE_SATISFIED = 1
    // usedAmountNew <= threshold => CLAUSE_DUMMY = 0
    clauseStatus === overThreshold.out;

    // Final rho binding, now over a validated clauseCom.
    component hRho = HashRho();
    hRho.actionHash <== actionHash;
    hRho.clauseCom <== clauseCom;
    hRho.N_old <== N_old;
    hRho.C_new <== C_new;
    hRho.out === rho;
}

component main { public [
    rootRegAct,
    rootStatusAct,
    rootPolAct,
    rtState,
    N_old,
    C_new,
    actionHash,
    amountCom,
    clauseCom,
    rho
] } = UpdateComplianceStateFull(8);
