#!/usr/bin/env python3
import csv, json, os, signal, subprocess, sys, time
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()
OUT_DIR = ROOT / "fixtures/ojcs_runtime_final_parallel"
WORK_DIR = ROOT / "run_artifacts/ojcs_runtime_final_parallel/preconditioning"
SYSTEM_CSV = OUT_DIR / "system_samples.csv"
SUMMARY = OUT_DIR / "preconditioning_summary.json"

ZKEY = ROOT / "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey"
WITNESS = WORK_DIR / "update_step2.wtns"
PROOF = WORK_DIR / "proof.json"
PUBLIC = WORK_DIR / "public.json"

TARGET_SECONDS = 600.0
SAMPLE_EVERY_SECONDS = 60.0

def iso_now():
    return datetime.now().astimezone().isoformat()

def read_system():
    la = Path("/proc/loadavg").read_text().strip().split()
    mem = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        if ":" in line:
            k,v = line.split(":",1)
            parts=v.strip().split()
            try:
                mem[k]=int(parts[0])
            except Exception:
                pass
    mhz=[]
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.lower().startswith("cpu mhz") and ":" in line:
                mhz.append(float(line.split(":",1)[1].strip()))
    except Exception:
        pass
    run,total=(None,None)
    if len(la) >= 4 and "/" in la[3]:
        try:
            run,total = [int(x) for x in la[3].split("/",1)]
        except Exception:
            pass
    return {
        "timestamp": iso_now(),
        "load1": float(la[0]),
        "load5": float(la[1]),
        "load15": float(la[2]),
        "runnableProcesses": run,
        "totalProcesses": total,
        "memAvailableKiB": mem.get("MemAvailable"),
        "memFreeKiB": mem.get("MemFree"),
        "cpuMHzMean": (sum(mhz)/len(mhz)) if mhz else None,
    }

def append_system(stage, round_no, note):
    s=read_system()
    exists=SYSTEM_CSV.exists()
    with SYSTEM_CSV.open("a", newline="") as f:
        w=csv.writer(f, lineterminator="\n")
        if not exists:
            w.writerow([
                "timestamp","stage","round","note",
                "load1","load5","load15",
                "runnable_processes","total_processes",
                "mem_available_kib","mem_free_kib","cpu_mhz_mean"
            ])
        w.writerow([
            s["timestamp"], stage, "" if round_no is None else round_no, note,
            s["load1"],s["load5"],s["load15"],
            "" if s["runnableProcesses"] is None else s["runnableProcesses"],
            "" if s["totalProcesses"] is None else s["totalProcesses"],
            "" if s["memAvailableKiB"] is None else s["memAvailableKiB"],
            "" if s["memFreeKiB"] is None else s["memFreeKiB"],
            "" if s["cpuMHzMean"] is None else f'{s["cpuMHzMean"]:.3f}'
        ])
    return s

def kill_group(proc):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=2.0)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        proc.wait(timeout=2.0)
    except Exception:
        pass

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    if SUMMARY.exists():
        print(f"ERROR: {SUMMARY} already exists; refusing to repeat preconditioning", file=sys.stderr)
        sys.exit(2)
    for p in [ZKEY, WITNESS]:
        if not p.exists():
            print(f"ERROR: missing {p}", file=sys.stderr)
            sys.exit(2)

    start_wall=time.monotonic()
    start_ts=iso_now()
    start_sys=append_system("precondition", None, "start")
    deadline=start_wall + TARGET_SECONDS
    next_sample=start_wall + SAMPLE_EVERY_SECONDS
    completed=0
    interrupted_final=False

    print(f"preconditioning_start={start_ts}")
    print(f"target_seconds={TARGET_SECONDS:.0f}")
    sys.stdout.flush()

    while True:
        now=time.monotonic()
        if now >= deadline:
            break

        # Start a fresh default-parallel snarkjs CLI proof.
        proc=subprocess.Popen(
            ["npx","snarkjs","groth16","prove",
             str(ZKEY),str(WITNESS),str(PROOF),str(PUBLIC)],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        while proc.poll() is None:
            now=time.monotonic()

            if now >= next_sample:
                s=append_system("precondition", None, "minute_sample")
                elapsed=now-start_wall
                print(f"preconditioning elapsed={elapsed:.1f}s completed_proofs={completed} load1={s['load1']:.2f} memAvailableKiB={s['memAvailableKiB']}")
                sys.stdout.flush()
                while next_sample <= now:
                    next_sample += SAMPLE_EVERY_SECONDS

            if now >= deadline:
                interrupted_final=True
                kill_group(proc)
                break

            time.sleep(min(0.2, max(0.01, deadline-now)))

        if interrupted_final:
            break

        rc=proc.returncode
        if rc != 0:
            print(f"ERROR: preconditioning proof failed rc={rc}", file=sys.stderr)
            sys.exit(rc if rc is not None else 3)
        completed += 1

        now=time.monotonic()
        if now >= next_sample:
            s=append_system("precondition", None, "minute_sample")
            elapsed=now-start_wall
            print(f"preconditioning elapsed={elapsed:.1f}s completed_proofs={completed} load1={s['load1']:.2f} memAvailableKiB={s['memAvailableKiB']}")
            sys.stdout.flush()
            while next_sample <= now:
                next_sample += SAMPLE_EVERY_SECONDS

    end_wall=time.monotonic()
    end_ts=iso_now()
    end_sys=append_system("precondition", None, "end")
    actual=end_wall-start_wall

    summary={
        "startTimestamp": start_ts,
        "endTimestamp": end_ts,
        "targetSeconds": TARGET_SECONDS,
        "actualSeconds": actual,
        "completedProofs": completed,
        "finalProofInterruptedAtFixedDeadline": interrupted_final,
        "mode": "default-parallel npx snarkjs groth16 prove",
        "startSystem": start_sys,
        "endSystem": end_sys,
        "systemSampleIntervalSeconds": SAMPLE_EVERY_SECONDS,
    }
    SUMMARY.write_text(json.dumps(summary,indent=2)+"\n")

    print(f"preconditioning_end={end_ts}")
    print(f"actual_seconds={actual:.3f}")
    print(f"completed_proofs={completed}")
    print(f"final_proof_interrupted_at_deadline={interrupted_final}")
    print("preconditioning: completed")

if __name__=="__main__":
    main()
