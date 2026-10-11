#!/usr/bin/env bash
set -euo pipefail
cd ~/projects/ncc-admission-prototype

EXPECTED_FULL="b7ccdfef1ec7150616e365bbbe109eaedfc190c2"
F="fixtures/ojcs_runtime_final_parallel"
R="run_artifacts/ojcs_runtime_final_parallel"
REPORT="docs/OJCS_RUNTIME_FINAL_PARALLEL_REPORT.md"

echo "===== PRE-RUN GUARD ====="
echo "HEAD: $(git rev-parse HEAD)"
if [ "$(git rev-parse HEAD)" != "$EXPECTED_FULL" ]; then
  echo "ERROR: expected HEAD $EXPECTED_FULL"
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: tracked files are modified or staged"
  git status --short
  exit 1
fi

echo "git status --short:"
git status --short
echo "nproc: $(nproc)"
echo "free -h:"
free -h
echo "/proc/loadavg:"
cat /proc/loadavg
echo "uptime:"
uptime

if [ -e "$F/proving_runs.csv" ] || [ -e "$F/preconditioning_summary.json" ] || [ -e "$REPORT" ]; then
  echo "ERROR: final sustained benchmark outputs already exist."
  echo "Refusing to overwrite or rerun."
  exit 2
fi

mkdir -p "$F" "$R/preconditioning"

echo
echo "===== ARTIFACT HASHES BEFORE ====="
sha256sum \
  fixtures/m4/init_input_user_001.json \
  fixtures/m7/update_full_input_step1.json \
  fixtures/m7/update_full_input_step2.json \
  run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm \
  run_artifacts/m8/init/InitComplianceState_final.zkey \
  run_artifacts/m8/init/verification_key.json \
  run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm \
  run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey \
  run_artifacts/m8/update/verification_key.json \
  | tee "$F/artifact_hashes_before.txt"

echo
echo "===== PREPARE FIXED UPDATE2 WITNESS FOR PRECONDITIONING ====="
node \
  run_artifacts/m8/update/UpdateComplianceStateFull_js/generate_witness.js \
  run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm \
  fixtures/m7/update_full_input_step2.json \
  "$R/preconditioning/update_step2.wtns"
test -s "$R/preconditioning/update_step2.wtns"

echo
echo "===== FIXED 10-MINUTE DEFAULT-PARALLEL PRECONDITIONING ====="
echo "Do not interact with the host or VM."
python3 scripts/ojcs_runtime_final_parallel/precondition.py

echo
echo "===== FORMAL BENCHMARK STARTS IMMEDIATELY ====="
echo "100 rounds; default-parallel snarkjs CLI; no sample exclusions."
node scripts/ojcs_runtime_final_parallel/measure_final_parallel.mjs

echo
echo "===== ARTIFACT HASHES AFTER ====="
sha256sum \
  fixtures/m4/init_input_user_001.json \
  fixtures/m7/update_full_input_step1.json \
  fixtures/m7/update_full_input_step2.json \
  run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm \
  run_artifacts/m8/init/InitComplianceState_final.zkey \
  run_artifacts/m8/init/verification_key.json \
  run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm \
  run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey \
  run_artifacts/m8/update/verification_key.json \
  | tee "$F/artifact_hashes_after.txt"

diff -u "$F/artifact_hashes_before.txt" "$F/artifact_hashes_after.txt"
echo "artifact hashes unchanged: pass"

echo
echo "===== BUILD STATISTICS / REPORT ====="
node scripts/ojcs_runtime_final_parallel/build_report.mjs

echo
echo "===== OUTPUTS ====="
ls -lh \
  "$F/proving_runs.csv" \
  "$F/measurement_summary.json" \
  "$F/system_samples.csv" \
  "$F/preconditioning_summary.json" \
  "$F/artifact_hashes_before.txt" \
  "$F/artifact_hashes_after.txt" \
  "$REPORT"

echo
echo "===== FINAL GIT STATUS ====="
git status --short

echo
echo "final sustained default-parallel benchmark: completed"
