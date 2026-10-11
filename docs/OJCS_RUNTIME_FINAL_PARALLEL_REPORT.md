# OJ-CS Final Sustained Default-Parallel Runtime Benchmark


## Methodology

A fixed 10-minute sustained preconditioning phase repeatedly ran `UpdateComplianceStateFull` using the default `npx snarkjs groth16 prove` path. Preconditioning proofs are excluded from the formal runtime CSV. Immediately afterward, 100 formal rounds were run with cyclic Init / Update1 / Update2 ordering. Witness, proof, and verification each use a fresh child process. The wall-clock timer surrounds the complete child-process invocation.

No `singleThread` option, CPU affinity restriction, sample deletion, or outlier filtering is used. Quartiles use Tukey median-of-halves. p95 uses the nearest-rank definition `sorted[ceil(0.95*n)-1]`.

## Preconditioning

- start: 2026-10-07T20:21:00.647255+08:00
- end: 2026-10-07T20:31:00.664317+08:00
- target: 600 s
- actual: 600.017 s
- completed full proofs: 204
- final proof interrupted at fixed deadline: true
- load1 start/end: 0.12 / 2.59
- MemAvailable start/end: 6701252 / 6433156 KiB

## Overall 100-run statistics

| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | IQR/median | Mean ms | Min ms | Max ms | p95 ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| init | witness | 100 | 171.644 | 160.249 | 193.096 | 32.847 | 19.14% | 177.110 | 119.000 | 237.478 | 224.191 |
| init | prove | 100 | 2851.735 | 2782.224 | 3109.190 | 326.966 | 11.47% | 2957.229 | 2461.963 | 4018.343 | 3429.257 |
| init | verify | 100 | 918.255 | 867.557 | 1000.544 | 132.987 | 14.48% | 941.798 | 772.955 | 1285.947 | 1082.086 |
| update_step1 | witness | 100 | 221.091 | 200.278 | 237.947 | 37.669 | 17.04% | 222.811 | 169.084 | 356.121 | 269.320 |
| update_step1 | prove | 100 | 3349.037 | 3272.341 | 3716.215 | 443.874 | 13.25% | 3491.510 | 2835.749 | 4934.204 | 4300.498 |
| update_step1 | verify | 100 | 929.162 | 884.437 | 993.414 | 108.977 | 11.73% | 943.932 | 799.040 | 1564.622 | 1094.834 |
| update_step2 | witness | 100 | 219.497 | 200.116 | 239.339 | 39.223 | 17.87% | 228.407 | 171.223 | 562.382 | 272.994 |
| update_step2 | prove | 100 | 3370.241 | 3258.130 | 3725.088 | 466.958 | 13.86% | 3519.283 | 3001.688 | 5436.440 | 4249.042 |
| update_step2 | verify | 100 | 928.467 | 885.424 | 1011.290 | 125.866 | 13.56% | 949.554 | 817.592 | 1215.606 | 1094.386 |

## 10-round segment medians

| Operation | Phase | 1–10 | 11–20 | 21–30 | 31–40 | 41–50 | 51–60 | 61–70 | 71–80 | 81–90 | 91–100 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| init | witness | 161.079 | 181.401 | 165.684 | 163.232 | 172.088 | 180.643 | 179.189 | 178.028 | 165.665 | 179.699 |
| init | prove | 2588.422 | 3070.900 | 2980.325 | 2862.114 | 2835.211 | 2794.188 | 2923.835 | 3179.319 | 2767.066 | 3138.508 |
| init | verify | 863.480 | 940.975 | 959.965 | 919.664 | 928.582 | 912.584 | 953.662 | 909.965 | 861.929 | 1016.425 |
| update_step1 | witness | 186.854 | 216.734 | 220.551 | 221.194 | 211.831 | 213.596 | 256.975 | 234.903 | 210.905 | 249.130 |
| update_step1 | prove | 3023.595 | 3786.997 | 3494.320 | 3300.724 | 3336.436 | 3345.938 | 3709.919 | 3755.288 | 3304.375 | 3807.930 |
| update_step1 | verify | 867.438 | 954.940 | 913.081 | 916.297 | 946.484 | 888.314 | 1014.898 | 961.859 | 919.838 | 988.554 |
| update_step2 | witness | 191.591 | 237.020 | 228.684 | 225.399 | 205.965 | 211.735 | 234.008 | 244.046 | 201.060 | 235.262 |
| update_step2 | prove | 3154.011 | 3665.692 | 3492.660 | 3355.666 | 3324.990 | 3352.426 | 3441.515 | 3786.191 | 3310.662 | 3850.834 |
| update_step2 | verify | 891.830 | 980.330 | 945.095 | 958.224 | 884.545 | 911.363 | 981.777 | 940.387 | 935.205 | 1002.711 |

## Cumulative convergence

| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | IQR/median |
|---|---|---:|---:|---:|---:|---:|---:|
| init | witness | 20 | 168.046 | 154.645 | 183.644 | 28.999 | 17.26% |
| init | witness | 40 | 165.548 | 156.829 | 194.961 | 38.132 | 23.03% |
| init | witness | 60 | 170.153 | 159.090 | 192.601 | 33.512 | 19.69% |
| init | witness | 80 | 171.448 | 159.125 | 192.601 | 33.476 | 19.53% |
| init | witness | 100 | 171.644 | 160.249 | 193.096 | 32.847 | 19.14% |
| init | prove | 20 | 2776.424 | 2576.604 | 3070.900 | 494.297 | 17.80% |
| init | prove | 40 | 2882.916 | 2762.324 | 3100.441 | 338.118 | 11.73% |
| init | prove | 60 | 2837.555 | 2768.501 | 3006.346 | 237.845 | 8.38% |
| init | prove | 80 | 2846.954 | 2785.070 | 3100.441 | 315.371 | 11.08% |
| init | prove | 100 | 2851.735 | 2782.224 | 3109.190 | 326.966 | 11.47% |
| init | verify | 20 | 890.753 | 856.918 | 957.238 | 100.320 | 11.26% |
| init | verify | 40 | 916.478 | 862.283 | 976.536 | 114.253 | 12.47% |
| init | verify | 60 | 916.478 | 865.285 | 987.009 | 121.724 | 13.28% |
| init | verify | 80 | 918.255 | 867.981 | 992.776 | 124.795 | 13.59% |
| init | verify | 100 | 918.255 | 867.557 | 1000.544 | 132.987 | 14.48% |
| update_step1 | witness | 20 | 201.157 | 183.475 | 225.976 | 42.501 | 21.13% |
| update_step1 | witness | 40 | 211.783 | 195.543 | 227.681 | 32.137 | 15.17% |
| update_step1 | witness | 60 | 212.856 | 197.381 | 227.593 | 30.213 | 14.19% |
| update_step1 | witness | 80 | 220.844 | 199.625 | 236.042 | 36.417 | 16.49% |
| update_step1 | witness | 100 | 221.091 | 200.278 | 237.947 | 37.669 | 17.04% |
| update_step1 | prove | 20 | 3204.168 | 3023.595 | 3786.997 | 763.402 | 23.83% |
| update_step1 | prove | 40 | 3293.209 | 3168.734 | 3667.643 | 498.910 | 15.15% |
| update_step1 | prove | 60 | 3315.201 | 3239.926 | 3425.931 | 186.006 | 5.61% |
| update_step1 | prove | 80 | 3341.997 | 3254.537 | 3679.453 | 424.916 | 12.71% |
| update_step1 | prove | 100 | 3349.037 | 3272.341 | 3716.215 | 443.874 | 13.25% |
| update_step1 | verify | 20 | 903.828 | 857.073 | 956.835 | 99.762 | 11.04% |
| update_step1 | verify | 40 | 911.584 | 875.902 | 972.530 | 96.628 | 10.60% |
| update_step1 | verify | 60 | 916.472 | 872.140 | 967.142 | 95.002 | 10.37% |
| update_step1 | verify | 80 | 928.608 | 877.829 | 987.967 | 110.139 | 11.86% |
| update_step1 | verify | 100 | 929.162 | 884.437 | 993.414 | 108.977 | 11.73% |
| update_step2 | witness | 20 | 213.333 | 191.591 | 237.020 | 45.429 | 21.29% |
| update_step2 | witness | 40 | 224.075 | 198.292 | 238.753 | 40.461 | 18.06% |
| update_step2 | witness | 60 | 212.844 | 198.950 | 235.365 | 36.414 | 17.11% |
| update_step2 | witness | 80 | 217.019 | 200.166 | 241.564 | 41.398 | 19.08% |
| update_step2 | witness | 100 | 219.497 | 200.116 | 239.339 | 39.223 | 17.87% |
| update_step2 | prove | 20 | 3314.235 | 3154.011 | 3665.692 | 511.681 | 15.44% |
| update_step2 | prove | 40 | 3353.233 | 3233.132 | 3672.865 | 439.733 | 13.11% |
| update_step2 | prove | 60 | 3346.567 | 3248.900 | 3538.725 | 289.826 | 8.66% |
| update_step2 | prove | 80 | 3360.541 | 3258.130 | 3672.865 | 414.736 | 12.34% |
| update_step2 | prove | 100 | 3370.241 | 3258.130 | 3725.088 | 466.958 | 13.86% |
| update_step2 | verify | 20 | 911.373 | 882.160 | 980.330 | 98.170 | 10.77% |
| update_step2 | verify | 40 | 918.508 | 884.709 | 998.908 | 114.199 | 12.43% |
| update_step2 | verify | 60 | 915.639 | 883.357 | 987.341 | 103.984 | 11.36% |
| update_step2 | verify | 80 | 919.887 | 884.709 | 1004.717 | 120.008 | 13.05% |
| update_step2 | verify | 100 | 928.467 | 885.424 | 1011.290 | 125.866 | 13.56% |

### n=60 -> 80 -> 100 change diagnostics

| Operation | Phase | median 60→80 | median 80→100 | IQR 60→80 | IQR 80→100 |
|---|---|---:|---:|---:|---:|
| init | witness | 0.76% | 0.11% | -0.11% | -1.88% |
| init | prove | 0.33% | 0.17% | 32.60% | 3.68% |
| init | verify | 0.19% | 0.00% | 2.52% | 6.56% |
| update_step1 | witness | 3.75% | 0.11% | 20.53% | 3.44% |
| update_step1 | prove | 0.81% | 0.21% | 128.44% | 4.46% |
| update_step1 | verify | 1.32% | 0.06% | 15.93% | -1.05% |
| update_step2 | witness | 1.96% | 1.14% | 13.69% | -5.25% |
| update_step2 | prove | 0.42% | 0.29% | 43.10% | 12.59% |
| update_step2 | verify | 0.46% | 0.93% | 15.41% | 4.88% |

## System/load observations

- total lightweight system samples: 64
- preconditioning load1 range: 0.12–2.94
- preconditioning MemAvailable range: 6336488–6701252 KiB
- formal load1 range: 2.23–3.68
- formal MemAvailable range: 6582624–6733164 KiB

CPU MHz sampled from inside the VM is retained only as diagnostic metadata and is not used as a manuscript performance claim.

## Interpretation boundary

This report intentionally does not auto-classify convergence or regime shifts. Readers can inspect the 10-round segment medians, cumulative n=60/80/100 changes, raw CSV, and system samples. A persistent slow/fast regime, if present, remains part of the default-parallel 4-vCPU virtualized measurement rather than a reason to delete samples or rerun for better values.

Raw formal observations: `fixtures/ojcs_runtime_final_parallel/proving_runs.csv`.

System samples: `fixtures/ojcs_runtime_final_parallel/system_samples.csv`.

Machine-readable summary: `fixtures/ojcs_runtime_final_parallel/measurement_summary.json`.
