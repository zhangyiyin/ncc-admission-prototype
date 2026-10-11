# hidden_state

Future object describing a hidden compliance state.

Conceptual fields:

```text
owner_u
epoch
policyID
gatewayID
usedAmount
txCount
riskLevel
flags
r
```

Privacy rule:

This object is witness-side only. It must not be emitted, stored as a public record, or written to public-chain calldata.
