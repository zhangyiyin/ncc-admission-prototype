pragma circom 2.1.6;

include "../lib/merkle_poseidon.circom";

// M4-local wrappers use the M1-R2 tag constants and Poseidon orderings.
// They do not define new tag values and do not alter M1-R2 hash ordering.

template M4HashOwner() {
    signal input sk_u;
    signal output out;
    component h = Poseidon(2);
    h.inputs[0] <== TAG_OWN();
    h.inputs[1] <== sk_u;
    out <== h.out;
}

template M4HashScope() {
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

template M4HashPolicyScope() {
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

template M4HashRegLeaf() {
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

template M4HashStatusLeaf() {
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

template M4HashPolicyParams() {
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

template M4HashPolicyLeaf() {
    signal input policyScopeHash;
    signal input policyParamsHash;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== TAG_POLICY_LEAF();
    h.inputs[1] <== policyScopeHash;
    h.inputs[2] <== policyParamsHash;
    out <== h.out;
}

template M4HashStateCore() {
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

template M4HashState() {
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

template M4HashGenesisNullifier() {
    signal input sk_u;
    signal input scopeHash;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== TAG_GEN();
    h.inputs[1] <== sk_u;
    h.inputs[2] <== scopeHash;
    out <== h.out;
}

template InitComplianceState(depth) {
    // Public inputs. The main component fixes their public ordering.
    signal input rootRegAct;
    signal input rootStatusAct;
    signal input rootPolAct;
    signal input N_gen;
    signal input C_gen;
    signal input policyScopeHash;

    // Private inputs.
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

    signal input rGen;

    signal input regSiblings[depth];
    signal input regPathIndices[depth];

    signal input statusSiblings[depth];
    signal input statusPathIndices[depth];

    signal input policySiblings[depth];
    signal input policyPathIndices[depth];

    component hOwner = M4HashOwner();
    hOwner.sk_u <== sk_u;

    component hScope = M4HashScope();
    hScope.e <== e;
    hScope.policyID <== policyID;
    hScope.gatewayID <== gatewayID;

    regScope === hScope.out;

    component hPolicyScope = M4HashPolicyScope();
    hPolicyScope.e <== e;
    hPolicyScope.policyID <== policyID;
    hPolicyScope.gatewayID <== gatewayID;
    hPolicyScope.policyVersion <== policyVersion;
    hPolicyScope.out === policyScopeHash;

    component hRegLeaf = M4HashRegLeaf();
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

    statusActive === 1;

    component hStatusLeaf = M4HashStatusLeaf();
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

    component hPolicyParams = M4HashPolicyParams();
    hPolicyParams.limit <== limit;
    hPolicyParams.threshold <== threshold;
    hPolicyParams.clauseType <== clauseType;

    component hPolicyLeaf = M4HashPolicyLeaf();
    hPolicyLeaf.policyScopeHash <== policyScopeHash;
    hPolicyLeaf.policyParamsHash <== hPolicyParams.out;

    component policyRoot = MerkleRootPoseidon(depth);
    policyRoot.leaf <== hPolicyLeaf.out;
    for (var k = 0; k < depth; k++) {
        policyRoot.siblings[k] <== policySiblings[k];
        policyRoot.pathIndices[k] <== policyPathIndices[k];
    }
    policyRoot.root === rootPolAct;

    component hStateCoreGen = M4HashStateCore();
    hStateCoreGen.usedAmount <== 0;
    hStateCoreGen.txCount <== 0;
    hStateCoreGen.riskLevel <== 0;
    hStateCoreGen.flags <== 0;

    component hCGen = M4HashState();
    hCGen.owner <== hOwner.out;
    hCGen.scopeHash <== hScope.out;
    hCGen.stateCoreHash <== hStateCoreGen.out;
    hCGen.r <== rGen;
    hCGen.out === C_gen;

    component hNGen = M4HashGenesisNullifier();
    hNGen.sk_u <== sk_u;
    hNGen.scopeHash <== hScope.out;
    hNGen.out === N_gen;
}

component main { public [
    rootRegAct,
    rootStatusAct,
    rootPolAct,
    N_gen,
    C_gen,
    policyScopeHash
] } = InitComplianceState(8);
