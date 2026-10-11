#!/usr/bin/env bash
set -euo pipefail
cd ~/projects/ncc-admission-prototype

{
  echo "===== OJ-CS RANGE SOUNDNESS AUDIT EVIDENCE ====="
  echo "HEAD: $(git rev-parse HEAD)"
  echo

  echo "===== ACTUAL CIRCUIT FILES INSPECTED ====="
  sha256sum \
    circuits/init_compliance_state/InitComplianceState.circom \
    circuits/update_compliance_state/UpdateComplianceStateFull.circom \
    node_modules/circomlib/circuits/comparators.circom
  echo

  echo "===== FINAL UPDATE RANGE / ARITHMETIC / COMPARATOR LOCATIONS ====="
  rg -n \
    'Num2Bits|usedAmountNew === usedAmountOld \+ amount|txCountNew === txCountOld \+ 1|LessEqThan|LessThan|clauseStatus === overThreshold.out' \
    circuits/update_compliance_state/UpdateComplianceStateFull.circom
  echo

  echo "===== INSTALLED COMPARATOR IMPLEMENTATION ====="
  rg -n -A14 -B2 \
    'template LessThan|template LessEqThan' \
    node_modules/circomlib/circuits/comparators.circom
  echo

  echo "===== RECORDED INTEGER WIDTHS ====="
  echo "amount: 64 bits"
  echo "usedAmountOld: 64 bits"
  echo "usedAmountNew: 64 bits"
  echo "limit: 64 bits"
  echo "threshold: 64 bits"
  echo "txCountOld: 32 bits"
  echo "txCountNew: 32 bits"
  echo "riskLevelOld/New: 32 bits (equality/hash only in current policy)"
  echo "flagsOld/New: 32 bits (equality/hash only in current policy)"
  echo "category: 32 bits"
  echo "chainID: 64 bits"
  echo "contractAddr: 160 bits"
  echo

  echo "===== BN254 / ADDITION REASONING CONSTANTS ====="
  echo "BN254 scalar modulus:"
  echo "21888242871839275222246405745257275088548364400416034343698204186575808495617"
  echo "max u64: 18446744073709551615"
  echo "max legal usedAmountOld + amount: 36893488147419103230 (= 2^65 - 2)"
  echo "legal 64-bit addition maximum is far below the BN254 scalar modulus"
  echo "usedAmountNew is independently Num2Bits(64), so a >=2^64 result cannot be represented as a legal new amount"
  echo "txCountNew is independently Num2Bits(32), so 2^32-1 -> 0 modular-style wrap is not a legal increment"
  echo

  echo "===== EXECUTABLE BOUNDARY / OVERFLOW CASES ====="
  npx ts-node scripts/ojcs/check_range_soundness.ts
} > ojcs_range_audit.log 2>&1

echo "wrote ojcs_range_audit.log"
tail -n 120 ojcs_range_audit.log
