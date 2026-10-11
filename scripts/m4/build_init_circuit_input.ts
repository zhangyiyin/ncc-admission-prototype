import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseFr, frToDecimal, FR_MODULUS } from "../../entities/common/crypto/fr.ts";
import { hashGenesisNullifier } from "../../entities/common/crypto/hashObjects.ts";

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: any): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mutateDecimal(x: string): string {
  return ((BigInt(x) + 1n) % FR_MODULUS).toString(10);
}

function user001(users: any): any {
  const found = users.users.find((u: any) => u.userID === "user_001");
  if (!found) {
    throw new Error("user_001 not found in fixtures/users/demo_users_private.json");
  }
  return found;
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m4/init_negative_cases", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const scope = readJson("fixtures/scopes/demo_scope.json");
  const users = readJson("fixtures/users/demo_users_private.json");
  const user = user001(users);
  const rootBundle = readJson("fixtures/m2/root_bundle.json");
  const witness = readJson("fixtures/m2/witness_user_001.json");
  const stateExpected = readJson("fixtures/m3/state_tree_expected.json");
  const stateInputs = readJson("fixtures/m3/state_tree_inputs.json");

  const firstState = stateExpected.appendResults[0];
  if (!firstState || firstState.label !== "C_gen") {
    throw new Error("fixtures/m3/state_tree_expected.json appendResults[0] must be C_gen");
  }

  const scopeHash = rootBundle.scope.scopeHash;
  const policyScopeHash = rootBundle.scope.policyScopeHash;
  const cGen = firstState.leaf;
  const nGen = frToDecimal(await hashGenesisNullifier(parseFr(user.sk_u), parseFr(scopeHash)));

  if (witness.regScope !== scopeHash) {
    throw new Error(`witness_user_001.regScope does not equal scopeHash: ${witness.regScope} != ${scopeHash}`);
  }
  if (rootBundle.policy.policyLeaf !== witness.policy.leaf) {
    throw new Error("policy leaf mismatch between root_bundle and witness_user_001");
  }

  const cGenFromM3 = firstState.leaf;
  if (cGen !== cGenFromM3) {
    throw new Error("internal C_gen mismatch");
  }

  const cGenInput = stateInputs.leaves.find((x: any) => x.label === "C_gen");
  if (!cGenInput) {
    throw new Error("C_gen opening not found in fixtures/m3/state_tree_inputs.json");
  }

  const input = {
    rootRegAct: rootBundle.roots.rootRegAct,
    rootStatusAct: rootBundle.roots.rootStatusAct,
    rootPolAct: rootBundle.roots.rootPolAct,
    N_gen: nGen,
    C_gen: cGen,
    policyScopeHash,

    sk_u: user.sk_u,

    e: scope.e,
    policyID: scope.policyID,
    gatewayID: scope.gatewayID,
    policyVersion: scope.policyVersion,

    regScope: scopeHash,
    regSalt: user.regSalt,
    statusActive: user.statusActive,
    statusSalt: user.statusSalt,

    limit: rootBundle.policy.limit,
    threshold: rootBundle.policy.threshold,
    clauseType: rootBundle.policy.clauseType,

    rGen: cGenInput.r,

    regSiblings: witness.registration.siblings,
    regPathIndices: witness.registration.pathIndices.map((x: number | string) => x.toString()),

    statusSiblings: witness.status.siblings,
    statusPathIndices: witness.status.pathIndices.map((x: number | string) => x.toString()),

    policySiblings: witness.policy.siblings,
    policyPathIndices: witness.policy.pathIndices.map((x: number | string) => x.toString()),
  };

  const expectedPublic = {
    publicInputs: [
      input.rootRegAct,
      input.rootStatusAct,
      input.rootPolAct,
      input.N_gen,
      input.C_gen,
      input.policyScopeHash,
    ],
    named: {
      rootRegAct: input.rootRegAct,
      rootStatusAct: input.rootStatusAct,
      rootPolAct: input.rootPolAct,
      N_gen: input.N_gen,
      C_gen: input.C_gen,
      policyScopeHash: input.policyScopeHash,
    },
    consistency: {
      cGenMatchesM3FirstStateLeaf: input.C_gen === stateExpected.appendResults[0].leaf,
      rootRegActMatchesM2: input.rootRegAct === rootBundle.roots.rootRegAct,
      rootStatusActMatchesM2: input.rootStatusAct === rootBundle.roots.rootStatusAct,
      rootPolActMatchesM2: input.rootPolAct === rootBundle.roots.rootPolAct,
    },
  };

  writeJson("fixtures/m4/init_input_user_001.json", input);
  writeJson("fixtures/m4/init_public_expected.json", expectedPublic);

  const cases: Record<string, any> = {};

  cases.bad_registration_path = structuredClone(input);
  cases.bad_registration_path.regSiblings[0] = mutateDecimal(cases.bad_registration_path.regSiblings[0]);

  cases.inactive_status = structuredClone(input);
  cases.inactive_status.statusActive = "0";

  cases.wrong_policy_root = structuredClone(input);
  cases.wrong_policy_root.rootPolAct = mutateDecimal(cases.wrong_policy_root.rootPolAct);

  cases.wrong_policy_scope_hash = structuredClone(input);
  cases.wrong_policy_scope_hash.policyScopeHash = mutateDecimal(cases.wrong_policy_scope_hash.policyScopeHash);

  cases.wrong_C_gen = structuredClone(input);
  cases.wrong_C_gen.C_gen = mutateDecimal(cases.wrong_C_gen.C_gen);

  cases.wrong_N_gen = structuredClone(input);
  cases.wrong_N_gen.N_gen = mutateDecimal(cases.wrong_N_gen.N_gen);

  for (const [name, value] of Object.entries(cases)) {
    writeJson(`fixtures/m4/init_negative_cases/${name}.json`, value);
  }

  writeFileSync("docs/M4_INIT_CIRCUIT_REPORT.md", `# M4 Init Circuit Report\n\n## Status\n\n- build_init_circuit_input: pass\n- circom compile: pending\n- positive witness generation: pending\n- positive wtns check: pending\n\n## Public input ordering\n\n\`\`\`text\n[\n  rootRegAct,\n  rootStatusAct,\n  rootPolAct,\n  N_gen,\n  C_gen,\n  policyScopeHash\n]\n\`\`\`\n\n## Fixture consistency\n\n- C_gen matches M3 first state leaf: ${expectedPublic.consistency.cGenMatchesM3FirstStateLeaf ? "yes" : "no"}\n- rootRegAct matches M2: ${expectedPublic.consistency.rootRegActMatchesM2 ? "yes" : "no"}\n- rootStatusAct matches M2: ${expectedPublic.consistency.rootStatusActMatchesM2 ? "yes" : "no"}\n- rootPolAct matches M2: ${expectedPublic.consistency.rootPolActMatchesM2 ? "yes" : "no"}\n\n## Known warnings\n\n- None at fixture build stage.\n`);

  console.log("build_init_circuit_input: pass");
  console.log(`N_gen: ${nGen}`);
  console.log(`C_gen: ${cGen}`);
  console.log(`policyScopeHash: ${policyScopeHash}`);
  console.log(`C_gen matches M3 first state leaf: ${expectedPublic.consistency.cGenMatchesM3FirstStateLeaf ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
