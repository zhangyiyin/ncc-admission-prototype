import { expect } from "chai";
import { readFileSync } from "node:fs";
import { FR_MODULUS } from "../../entities/common/crypto/fr.ts";
import { poseidonHash } from "../../entities/common/crypto/poseidon.ts";
import { TAGS, CLAUSE } from "../../entities/common/crypto/tags.ts";
import { hashAction, hashAmount, hashClause, hashMerkleNode, hashRho } from "../../entities/common/crypto/hashObjects.ts";
import { generateHashVectors } from "../../entities/common/crypto/testVectors.ts";
import type { RawHashInputs } from "../../entities/common/crypto/testVectors.ts";

function rawInputs(): RawHashInputs {
  return JSON.parse(readFileSync("fixtures/m1/hash-inputs.json", "utf8")) as RawHashInputs;
}

function expectedVectors(): any {
  return JSON.parse(readFileSync("fixtures/m1/hash-expected.json", "utf8"));
}

function b(x: string): bigint {
  return BigInt(x);
}

describe("M1-R2 JS hash vectors", function () {
  it("matches generated JS expected vectors", async function () {
    const live = await generateHashVectors(rawInputs());
    expect(live).to.deep.equal(expectedVectors());
  });

  it("all decimal hash outputs are field elements", async function () {
    const vectors = await generateHashVectors(rawInputs());
    for (const [key, value] of Object.entries(vectors.outputs)) {
      const v = BigInt(value as string);
      expect(v >= 0n, key).to.equal(true);
      expect(v < FR_MODULUS, key).to.equal(true);
    }
  });

  it("changing amount changes amountCom", async function () {
    const v = expectedVectors();
    const changed = await hashAmount(18001n, b(v.inputs.rAmt1), b(v.outputs.scopeHash), b(v.inputs.nonce1));
    expect(changed.toString()).to.not.equal(v.outputs.amountCom1);
  });

  it("changing r_amt changes amountCom", async function () {
    const v = expectedVectors();
    const changed = await hashAmount(b(v.inputs.amount1), 810009n, b(v.outputs.scopeHash), b(v.inputs.nonce1));
    expect(changed.toString()).to.not.equal(v.outputs.amountCom1);
  });

  it("changing nonce changes amountCom and actionHash", async function () {
    const v = expectedVectors();
    const changedAmountCom = await hashAmount(b(v.inputs.amount1), b(v.inputs.rAmt1), b(v.outputs.scopeHash), 999n);
    const changedActionHash = await hashAction(b(v.outputs.scopeHash), changedAmountCom, b(v.outputs.actionContextHash1));
    expect(changedAmountCom.toString()).to.not.equal(v.outputs.amountCom1);
    expect(changedActionHash.toString()).to.not.equal(v.outputs.actionHash1);
  });

  it("changing clauseStatus changes clauseCom", async function () {
    const v = expectedVectors();
    const changed = await hashClause(
      b(v.outputs.actionHash1),
      b(v.inputs.clauseType),
      CLAUSE.CLAUSE_INVALID,
      b(v.outputs.evidenceDigestDummy),
      b(v.inputs.rClauseDummy),
    );
    expect(changed.toString()).to.not.equal(v.outputs.clauseComDummy);
  });

  it("changing C_new changes rho", async function () {
    const v = expectedVectors();
    const changedC = await hashMerkleNode(b(v.outputs.C_state1), 123n);
    const changed = await hashRho(b(v.outputs.actionHash1), b(v.outputs.clauseComDummy), b(v.outputs.N_old), changedC);
    expect(changed.toString()).to.not.equal(v.outputs.rho1);
  });

  it("actionHash uses amountCom rather than plaintext amount", async function () {
    const v = expectedVectors();
    expect(v.updatePublicInputs).to.include(v.outputs.amountCom1);
    expect(v.updatePublicInputs).to.not.include(v.inputs.amount1);
  });

  it("proof public input ordering is frozen", async function () {
    const v = expectedVectors();
    expect(v.initPublicInputs).to.deep.equal([
      v.inputs.rootRegAct,
      v.inputs.rootStatusAct,
      v.inputs.rootPolAct,
      v.outputs.N_gen,
      v.outputs.C_gen,
      v.outputs.policyScopeHash,
    ]);
    expect(v.updatePublicInputs).to.deep.equal([
      v.inputs.rootRegAct,
      v.inputs.rootStatusAct,
      v.inputs.rootPolAct,
      v.inputs.rtState,
      v.outputs.N_old,
      v.outputs.C_state1,
      v.outputs.actionHash1,
      v.outputs.amountCom1,
      v.outputs.clauseComDummy,
      v.outputs.rho1,
    ]);
  });

  it("ordering negative checks catch swapped fields", async function () {
    const v = expectedVectors();

    const amountComSwapped = await poseidonHash([
      TAGS.TAG_AMOUNT,
      b(v.inputs.rAmt1),
      b(v.inputs.amount1),
      b(v.outputs.scopeHash),
      b(v.inputs.nonce1),
    ]);
    expect(amountComSwapped.toString()).to.not.equal(v.outputs.amountCom1);

    const policyLeafSwapped = await poseidonHash([
      TAGS.TAG_POLICY_LEAF,
      b(v.outputs.policyParamsHash),
      b(v.outputs.policyScopeHash),
    ]);
    expect(policyLeafSwapped.toString()).to.not.equal(v.outputs.policyLeaf);

    const actionContextSwapped = await poseidonHash([
      TAGS.TAG_ACTION_CONTEXT,
      b(v.inputs.category),
      b(v.inputs.chainID),
      b(v.inputs.contractAddr),
      b(v.inputs.receiverDigest),
      b(v.inputs.nonce1),
    ]);
    expect(actionContextSwapped.toString()).to.not.equal(v.outputs.actionContextHash1);

    const actionHashSwapped = await poseidonHash([
      TAGS.TAG_ACTION,
      b(v.outputs.amountCom1),
      b(v.outputs.scopeHash),
      b(v.outputs.actionContextHash1),
    ]);
    expect(actionHashSwapped.toString()).to.not.equal(v.outputs.actionHash1);

    const rhoSwapped = await poseidonHash([
      TAGS.TAG_RHO,
      b(v.outputs.clauseComDummy),
      b(v.outputs.actionHash1),
      b(v.outputs.N_old),
      b(v.outputs.C_state1),
    ]);
    expect(rhoSwapped.toString()).to.not.equal(v.outputs.rho1);
  });
});
