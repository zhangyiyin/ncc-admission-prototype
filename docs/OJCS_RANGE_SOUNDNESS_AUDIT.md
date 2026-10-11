# OJ-CS Range Soundness Audit

## Scope

This audit checks the final `UpdateComplianceStateFull` circuit used by the NCC prototype. It is a local circuit-correctness audit. It does not change the protocol or the main split-withdrawal demo.

## Static range audit

| Field | Intended range | Constraint | Arithmetic | Comparator | Assessment |
|---|---:|---|---|---|---|
| amount | 0..2^64-1 | Num2Bits(64) | usedAmountOld + amount | no | safe |
| usedAmountOld | 0..2^64-1 | Num2Bits(64) | usedAmountOld + amount | no | safe |
| usedAmountNew | 0..2^64-1 | Num2Bits(64) | addition result | LessEqThan(64), LessThan(64) | safe |
| limit | 0..2^64-1 | Num2Bits(64) | no | LessEqThan(64) | safe |
| threshold | 0..2^64-1 | Num2Bits(64) | no | LessThan(64) | safe |
| txCountOld | 0..2^32-1 | Num2Bits(32) | txCountOld + 1 | no | safe |
| txCountNew | 0..2^32-1 | Num2Bits(32) | increment result | no | safe |

The installed circomlib version is 2.0.5. The final circuit uses `LessEqThan(64)` for the limit check and `LessThan(64)` for the strict threshold check.

## InitComplianceState range boundary

`InitComplianceState` has a different range boundary from `UpdateComplianceStateFull`.

The init relation accepts `limit` and `threshold` as policy inputs and binds them into `M4HashPolicyParams`, but it does **not** apply `Num2Bits` to those two values and does not use them in arithmetic or comparison inside the init relation. The genesis numeric state is not witness-selected: `usedAmount = 0`, `txCount = 0`, `riskLevel = 0`, and `flags = 0` are hard-coded when `C_gen` is formed.

Accordingly, this audit does **not** claim that `InitComplianceState` by itself proves

`limit, threshold in [0, 2^64 - 1]`.

Its role at initialization is to prove membership of the selected active policy leaf and bind the fixed zero-valued genesis state. The ordinary-integer decision boundary is enforced when that state is consumed by the final update relation: `UpdateComplianceStateFull` independently constrains `limit` and `threshold` with `Num2Bits(64)` before applying `LessEqThan(64)` and `LessThan(64)`.

Therefore, a policy leaf containing a field element outside the intended 64-bit domain could still be hash-consistent with an `InitComplianceState` policy-membership proof, but it could not be used to produce a valid `UpdateComplianceStateFull` proof under the final relation. Such a malformed policy would make the initialized state unusable for the ordinary update path; it does not provide a modulo-field bypass for an accepted update.

No circuit change is made for this documentation clarification.

## Field-wrap reasoning

The BN254 scalar-field modulus is:

`21888242871839275222246405745257275088548364400416034343698204186575808495617`.

For legal 64-bit inputs,

`usedAmountOld + amount <= 2^65 - 2`,

which is far below the BN254 scalar-field modulus. Therefore the legal integer addition cannot wrap modulo the field. In addition, `usedAmountNew` is independently constrained to 64 bits.

The adversarial `p-1 + 1 = 0 mod p` case is included below. It must be rejected because `p-1` is outside the 64-bit range for `usedAmountOld`.

For `txCount`, both old and new values are independently constrained to 32 bits. The transition `2^32-1 -> 0` therefore cannot be used as an integer wraparound.

## Boundary semantics

The implemented threshold rule is strict:

`usedAmountNew > threshold`.

Thus equality does not cross the threshold.

The implemented ordinary-path limit rule is:

`usedAmountNew <= limit`.

Thus equality with the limit remains valid.

Zero amount is not prohibited by the current circuit; it is tested as a boundary case rather than classified as a negative case.

## Executable boundary results

| Case | Expected | Actual | Result |
|---|---|---|---|
| zero_boundary | accept | accept | pass |
| threshold_minus_1 | accept | accept | pass |
| threshold_equal | accept | accept | pass |
| threshold_plus_1 | accept | accept | pass |
| limit_minus_1 | accept | accept | pass |
| limit_equal | accept | accept | pass |
| limit_plus_1 | reject | reject | pass |
| max_u64_legal | accept | accept | pass |
| out_of_range_limit_2pow64 | reject | reject | pass |
| out_of_range_threshold_2pow64 | reject | reject | pass |
| amount_2pow64 | reject | reject | pass |
| u64_addition_overflow_candidate | reject | reject | pass |
| bn254_field_wrap_candidate | reject | reject | pass |
| txcount_max_legal | accept | accept | pass |
| txcount_overflow_candidate | reject | reject | pass |

## Conclusion

All static and executable checks are consistent with the intended non-negative integer semantics if `allMatched = true` in `fixtures/ojcs/range_soundness_cases.json`.

No circuit change is required when all cases match. No verifier or proving-key regeneration is required for this audit-only outcome.
