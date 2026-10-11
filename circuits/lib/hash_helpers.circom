pragma circom 2.1.6;

include "constants.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";

template HashOwner() {
    signal input sk_u;
    signal output out;
    component h = Poseidon(2);
    h.inputs[0] <== TAG_OWN();
    h.inputs[1] <== sk_u;
    out <== h.out;
}

template HashScope() {
    signal input e;
    signal input policyID;
    signal input gatewayID;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_SCOPE();
    h.inputs[1] <== e;
    h.inputs[2] <== policyID;
    h.inputs[3] <== gatewayID;
    out <== h.out;
}

template HashPolicyScope() {
    signal input e;
    signal input policyID;
    signal input gatewayID;
    signal input policyVersion;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_POLICY_SCOPE();
    h.inputs[1] <== e;
    h.inputs[2] <== policyID;
    h.inputs[3] <== gatewayID;
    h.inputs[4] <== policyVersion;
    out <== h.out;
}

template HashStateCore() {
    signal input usedAmount;
    signal input txCount;
    signal input riskLevel;
    signal input flags;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_STATE_CORE();
    h.inputs[1] <== usedAmount;
    h.inputs[2] <== txCount;
    h.inputs[3] <== riskLevel;
    h.inputs[4] <== flags;
    out <== h.out;
}

template HashState() {
    signal input owner;
    signal input scopeHash;
    signal input stateCoreHash;
    signal input r;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_STATE();
    h.inputs[1] <== owner;
    h.inputs[2] <== scopeHash;
    h.inputs[3] <== stateCoreHash;
    h.inputs[4] <== r;
    out <== h.out;
}

template HashAmount() {
    signal input amount;
    signal input r_amt;
    signal input scopeHash;
    signal input nonce;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_AMOUNT();
    h.inputs[1] <== amount;
    h.inputs[2] <== r_amt;
    h.inputs[3] <== scopeHash;
    h.inputs[4] <== nonce;
    out <== h.out;
}

template HashGenesisNullifier() {
    signal input sk_u;
    signal input scopeHash;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== TAG_GEN();
    h.inputs[1] <== sk_u;
    h.inputs[2] <== scopeHash;
    out <== h.out;
}

template HashStateNullifier() {
    signal input sk_u;
    signal input C_old;
    signal input scopeHash;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_STATE_NULL();
    h.inputs[1] <== sk_u;
    h.inputs[2] <== C_old;
    h.inputs[3] <== scopeHash;
    out <== h.out;
}

template HashRegLeaf() {
    signal input owner;
    signal input regScope;
    signal input regSalt;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_REG();
    h.inputs[1] <== owner;
    h.inputs[2] <== regScope;
    h.inputs[3] <== regSalt;
    out <== h.out;
}

template HashStatusLeaf() {
    signal input owner;
    signal input statusActive;
    signal input e;
    signal input statusSalt;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_STATUS();
    h.inputs[1] <== owner;
    h.inputs[2] <== statusActive;
    h.inputs[3] <== e;
    h.inputs[4] <== statusSalt;
    out <== h.out;
}

template HashPolicyParams() {
    signal input limit;
    signal input threshold;
    signal input clauseType;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_POLICY_PARAMS();
    h.inputs[1] <== limit;
    h.inputs[2] <== threshold;
    h.inputs[3] <== clauseType;
    out <== h.out;
}

template HashPolicyLeaf() {
    signal input policyScopeHash;
    signal input policyParamsHash;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== TAG_POLICY_LEAF();
    h.inputs[1] <== policyScopeHash;
    h.inputs[2] <== policyParamsHash;
    out <== h.out;
}

template HashActionContext() {
    signal input category;
    signal input chainID;
    signal input contractAddr;
    signal input nonce;
    signal input receiverDigest;
    signal output out;
    component h = Poseidon(6);
    h.inputs[0] <== TAG_ACTION_CONTEXT();
    h.inputs[1] <== category;
    h.inputs[2] <== chainID;
    h.inputs[3] <== contractAddr;
    h.inputs[4] <== nonce;
    h.inputs[5] <== receiverDigest;
    out <== h.out;
}

template HashAction() {
    signal input scopeHash;
    signal input amountCom;
    signal input actionContextHash;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_ACTION();
    h.inputs[1] <== scopeHash;
    h.inputs[2] <== amountCom;
    h.inputs[3] <== actionContextHash;
    out <== h.out;
}

template HashMockSofEvidence() {
    signal input scopeHash;
    signal input nonce;
    signal input evidenceSalt;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== TAG_MOCK_SOF();
    h.inputs[1] <== scopeHash;
    h.inputs[2] <== nonce;
    h.inputs[3] <== evidenceSalt;
    out <== h.out;
}

template HashClause() {
    signal input actionHash;
    signal input clauseType;
    signal input clauseStatus;
    signal input evidenceDigest;
    signal input r_clause;
    signal output out;
    component h = Poseidon(6);
    h.inputs[0] <== TAG_CLAUSE();
    h.inputs[1] <== actionHash;
    h.inputs[2] <== clauseType;
    h.inputs[3] <== clauseStatus;
    h.inputs[4] <== evidenceDigest;
    h.inputs[5] <== r_clause;
    out <== h.out;
}

template HashRho() {
    signal input actionHash;
    signal input clauseCom;
    signal input N_old;
    signal input C_new;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== TAG_RHO();
    h.inputs[1] <== actionHash;
    h.inputs[2] <== clauseCom;
    h.inputs[3] <== N_old;
    h.inputs[4] <== C_new;
    out <== h.out;
}

template HashMerkleNode() {
    signal input left;
    signal input right;
    signal output out;
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}
