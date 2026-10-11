# gateway_package

Future object describing the off-chain package sent from user to gateway.

Expected contents may include:

- `amount_j`
- `r_amt`
- Epoch.
- `policyID`.
- `gatewayID`.
- Category.
- Chain ID.
- Contract address.
- Nonce.
- Receiver digest.
- `rho`.

Privacy rule:

The gateway package is not public-chain calldata. The public chain should see `amountCom`, not `amount_j`.
