# Privacy Boundary

This document records allowed and forbidden ordinary public fields for the future prototype.

## Allowed update public fields

Future update records and privacy-preserving update events may include:

- `rho`
- `N_old`
- `C_new`
- `rt_state`
- `newStateRoot`
- `actionHash`
- `amountCom`
- `clauseCom`

## Forbidden public fields

Future public calldata, events, accepted records, and public storage must not expose:

- `C_old`
- `owner_u`
- `sk_u`
- `regLeaf`
- `statusLeaf`
- `usedAmount_old`
- `usedAmount_new`
- `amount_j`
- `r_amt`
- `r_clause`
- `MerklePath`
- `linkableID`
- `nym`
- User-level aggregation tag

## Gateway boundary

The gateway may receive `amount_j` and `r_amt` off-chain to execute the regulated action. This does not mean these values may appear in the ordinary public-chain path.

## Debug boundary

A future debug-only gateway may expose amount values for negative tests, but such functions and events must be documented as debug-only and excluded from the main privacy claim.

## T0.1 boundary

T0.1 does not implement privacy inspection logic. It only freezes the documentation boundary.
