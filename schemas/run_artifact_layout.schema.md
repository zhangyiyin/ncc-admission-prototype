# run_artifact_layout

Recommended future run layout:

```text
run_artifacts/
  local_demo_YYYYMMDD_HHMMSS/
    00_setup_scope/
    01_init_state/
    02_update_01/
    03_update_02_threshold/
    04_update_03_reject/
    05_negative_duplicate_genesis/
    06_negative_fork/
    07_gateway_mismatch/
    08_privacy_inspection/
    09_measurement/
    run_summary.json
```

T0.1 does not generate these run artifacts.
