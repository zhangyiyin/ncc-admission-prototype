#!/usr/bin/env python3
from pathlib import Path
import subprocess, tempfile, os, re, json, hashlib, sys

REPO = Path(__file__).resolve().parents[2]
BASELINE_COMMIT = "2d3d158673fac866eea2f02cdaa73ba5e8d5e989"
FULL = REPO / "circuits/update_compliance_state/UpdateComplianceStateFull.circom"
EXPECTED_FULL_SHA256 = "a17a1efbafc605d3cb174c98910f2d40421468b7a77c6ddfc277cfeeede55bce"
DEPTHS = [8, 16, 24, 32]
DEFAULT_OUT = REPO / "fixtures/ojcs_depth_scaling/constraint_scaling.json"

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def metric(text, label):
    m = re.search(rf"(?m)^{re.escape(label)}:\s*(\d+)\s*$", text)
    if not m:
        raise RuntimeError(f"cannot parse {label!r}")
    return int(m.group(1))

def main():
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT

    if sha256(FULL) != EXPECTED_FULL_SHA256:
        raise SystemExit("production Full circuit hash does not match the 2d3d158 baseline")

    original = FULL.read_text()
    main_pat = re.compile(r"=\s*UpdateComplianceStateFull\(\s*8\s*\)\s*;")
    if len(list(main_pat.finditer(original))) != 1:
        raise SystemExit("expected exactly one UpdateComplianceStateFull(8) main instantiation")

    rows = []
    with tempfile.TemporaryDirectory(prefix="ojcs_depth_scaling_") as td:
        temp = Path(td)
        (temp / "circuits/update_compliance_state").mkdir(parents=True)
        os.symlink(REPO / "circuits/lib", temp / "circuits/lib", target_is_directory=True)
        os.symlink(REPO / "node_modules", temp / "node_modules", target_is_directory=True)

        for depth in DEPTHS:
            variant = temp / "circuits/update_compliance_state" / f"UpdateComplianceStateFull_depth{depth}.circom"
            variant.write_text(main_pat.sub(f"= UpdateComplianceStateFull({depth});", original, count=1))
            outdir = temp / f"r1cs_depth_{depth}"
            outdir.mkdir()

            p = subprocess.run(
                ["circom", str(variant), "--r1cs", "-o", str(outdir)],
                cwd=REPO, text=True, capture_output=True
            )
            if p.returncode != 0:
                sys.stderr.write(p.stdout)
                sys.stderr.write(p.stderr)
                raise SystemExit(p.returncode)

            text = p.stdout + "\n" + p.stderr
            nonlin = metric(text, "non-linear constraints")
            linear = metric(text, "linear constraints")
            public = metric(text, "public inputs")
            rows.append({
                "depth": depth,
                "nonLinearConstraints": nonlin,
                "linearConstraints": linear,
                "totalConstraints": nonlin + linear,
                "publicInputs": public,
            })

    d_nonlin = [rows[i+1]["nonLinearConstraints"] - rows[i]["nonLinearConstraints"] for i in range(3)]
    d_linear = [rows[i+1]["linearConstraints"] - rows[i]["linearConstraints"] for i in range(3)]
    d_total = [rows[i+1]["totalConstraints"] - rows[i]["totalConstraints"] for i in range(3)]

    result = {
        "baselineCommit": BASELINE_COMMIT,
        "experimentName": "uniform membership-depth scaling",
        "affectedMembershipPaths": ["registration", "status", "policy", "state"],
        "stateTreeOnlyScaling": False,
        "methodology": {
            "compileR1CSOnly": True,
            "witnessBenchmark": False,
            "provingBenchmark": False,
            "setupOrZkeyGeneration": False,
            "solidityVerifierGeneration": False,
            "depths": DEPTHS,
        },
        "results": rows,
        "scaling": {
            "exactAffineAcrossMeasuredDepths": len(set(d_nonlin)) == 1 and len(set(d_linear)) == 1 and len(set(d_total)) == 1,
            "deltaPer8DepthLevels": {
                "nonLinearConstraints": d_nonlin,
                "linearConstraints": d_linear,
                "totalConstraints": d_total,
            },
            "perDepthLevel": {
                "nonLinearConstraints": d_nonlin[0] // 8,
                "linearConstraints": d_linear[0] // 8,
                "totalConstraints": d_total[0] // 8,
            },
        },
        "runtimeFeasibility": {
            "benchmarked": False,
            "note": "The current dense off-chain tree builder becomes impractical at depth 24/32. Scalable sparse/on-demand witness maintenance is not implemented in the prototype."
        },
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(out)

if __name__ == "__main__":
    main()
