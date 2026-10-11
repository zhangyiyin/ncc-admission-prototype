# M11 Full Local Demo Report

## Status

- run_full_local_demo: pass
- check_full_local_demo: pass
- hardhat compile: pass
- hardhat test m11: pass

## Init

- accepted: true
- newStateRoot: 6184715872336434441857866957448557330732440228231919952177520071042425498083
- stateIndex: 0
- N_gen: 17766401949085797926135549035069317269837656481692000435383030373734283992943
- C_gen: 18642456385847559776773798185157556476501869169874141018486943258724472976549
- policyScopeHash: 6644719138175246900961796555768316920309012588551962331046010273977335826156

## Step1

- hidden transition: 0 -> 18000
- admission accepted: true
- gateway accepted: true
- newStateRoot: 18214468675329363424914426193265284265526863822044876243062858448795993613495
- rho: 12734960571478142793239939966609539292957667552557480174177333018055464002592
- amountCom: 4052888969813845085336314589908854524791284491943363627709942801413724245159
- actionHash: 15431768514139257405190146949538713766171895702271871013370720760190766607703

## Step2

- hidden transition: 18000 -> 36000
- admission accepted: true
- gateway accepted: true
- newStateRoot: 9004445721392407617765566758736899121143153381771154831081323089196260973334
- rho: 19167179697200692285661804443808434675575536330458288699935270006387337649736
- amountCom: 6152682687489577387770139482597855173241424913830733204248807161757473009807
- actionHash: 21718417864773885484144376032692000056052491591600380839884459381005560608895
- clause status private demo fact: SATISFIED

## Step3

- hidden transition: 36000 -> 54000
- rejected: true
- rejection layer: circuit
- reason: usedAmountNew exceeds policy limit
- proof generated: no
- on-chain update attempted: no
- gateway executed: no

## Privacy

- public chain amount exposed: no
- public chain usedAmount exposed: no
- public chain clauseStatus exposed: no
- user-level link tag exposed: no
- forbidden private witness exposed in publicRecord: no

## Command evidence

### check_admission_contract

- command: `npx ts-node scripts/m9/check_admission_contract.ts`
- status: pass

```text
check_admission_contract: pass
```

### check_gateway_execution

- command: `npx ts-node scripts/m10/check_gateway_execution.ts`
- status: pass

```text
wrote fixtures/m10/gateway_receipt_step1.json
wrote fixtures/m10/gateway_receipt_step2.json
wrote fixtures/m10/gateway_negative_results.json
check_gateway_execution: pass
```

### check_update_full_circuit

- command: `npx ts-node scripts/m7/check_update_full_circuit.ts`
- status: pass

```text
[32mtemplate instances[0m: 387
non-linear constraints: 14351
linear constraints: 17426
public inputs: 10
private inputs: 96 (93 belong to witness)
public outputs: 0
wires: 31818
labels: 48688
[32mWritten successfully:[0m build/m7/UpdateComplianceStateFull.r1cs
[32mWritten successfully:[0m build/m7/UpdateComplianceStateFull.sym
[32mWritten successfully:[0m build/m7/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm
[32mEverything went okay[0m
check_update_full_circuit: pass
step1 witness: pass
step1 wtns check: pass
step2 witness: pass
step2 wtns check: pass
negative wrong_clauseCom: pass
negative wrong_clauseCom_matching_rho: pass
negative wrong_evidenceSalt: pass
negative wrong_rClause: pass
negative step1_wrong_clauseStatus_satisfied: pass
negative step2_wrong_clauseStatus_dummy: pass
negative wrong_actionHash: pass
negative wrong_rho: pass
negative wrong_nonce: pass
negative amount_action_mismatch: pass
negative bad_state_path: pass
negative exceeds_limit: pass
```

### hardhat compile

- command: `npx hardhat compile`
- status: pass

```text
No contracts to compile
```

## Known warnings

- Node may print [DEP0180] fs.Stats constructor is deprecated. This is non-blocking.
- Hardhat may print hre.network.connect() deprecation warnings. This is non-blocking.
- M11 deliberately does not run gas benchmarks or public testnet deployment.
