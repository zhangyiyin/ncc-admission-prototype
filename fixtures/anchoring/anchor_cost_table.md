# Anchor Cost Table

Illustrative parameterized estimate. These values are not real-time market prices.

## Gas inputs

| Item | Gas |
|---|---:|
| L1 updateState step1 | 899250 |
| L1 updateState step2 | 899262 |
| L1 updateState average | 899256 |
| L1 BatchAnchor submit | 738327 |

## Per-update cost estimate

| Path | Batch size | USD per update | CNY per update | Notes |
|---|---:|---:|---:|---|
| L1 per-update admission | - | 40.466520 | 291.358944 | M12 updateState average gas on L1 parameterization |
| L2 per-update admission | - | 0.001000-0.050000 | 0.007200-0.360000 | parameterized L2 update estimate |
| L2 + L1 anchor | 10 | 3.323472-3.372472 | 23.928995-24.281795 | L2 update + anchor/N |
| L2 + L1 anchor | 100 | 0.333247-0.382247 | 2.399379-2.752179 | L2 update + anchor/N |
| L2 + L1 anchor | 1000 | 0.034225-0.083225 | 0.246418-0.599218 | L2 update + anchor/N |

## Parameters

| Parameter | Value |
|---|---:|
| ETH_USD | 3000 |
| USD_CNY | 7.2 |
| L1_GWEI | 15 |
| L2_UPDATE_USD_LOW | 0.001 |
| L2_UPDATE_USD_HIGH | 0.05 |
| BATCH_SIZES | 10, 100, 1000 |
