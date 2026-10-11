# status_bundle

Future object describing mock status setup.

Expected contents may include:

- Status scope.
- `statusActive`.
- Status salt reference.
- Status leaf.
- Status root.
- Status Merkle witness.

Forbidden public-chain contents:

- `owner_u`.
- Status Merkle path as ordinary calldata or event data.
