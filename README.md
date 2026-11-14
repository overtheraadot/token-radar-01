# Launch Radar — token-radar-01 entry (overtheraa)

Which pre-token protocol is worth farming next, and what do you do about it?

## The model — `launch-window-1`

Every protocol in the sealed snapshot that **records no token** (no market cap, no
CoinGecko id, no symbol) is ranked by an implied value built from the snapshot's own
figures — nothing else, no hardcoded names:

```
implied = TVL × category multiple × momentum × launch window × category heat × breadth
```

1. **Category multiple** — the median market-cap-to-TVL of the live-token protocols in
   the same category. Each comparable ratio is winsorised at 3.0×, and the median is
   shrunk toward the global median with weight `n / (n + 3)`, so thin categories lean
   on the whole market instead of one noisy comparable.
2. **Momentum** — the 7-day TVL change, clamped to [-50, +100]. Gains count at 0.6×
   weight, losses at 1.2×: a protocol bleeding TVL is a worse farming bet than a flat one.
3. **Launch window** — a hump over the protocol's age with no token: 0.55 at listing,
   rising to 1.00 at 540 days, then decaying toward 0.85. A protocol that has run a year
   and a half with no token has the most pent-up launch value; one that has run five
   years without issuing one may simply never issue one.
4. **Category heat** — the median 7-day change of the category's live comparables,
   clamped to [-20, +30], at half weight.
5. **Breadth** — 1 + 0.04 per extra chain, up to four extra chains.

The board ranks all 198 rankable pre-token protocols — the 40 on the snapshot's
watchlist plus the 158 below the floor it exists to find. Wrapped, staked and bridged
products of tokens that already trade, exchanges and versioned pools are left out:
they are not launches waiting to happen. Live-token protocols are shown separately at
the market's own values and serve as the comparables.

## The dashboard

`dashboard/` is a static page (no network, no framework) that reads `data.js`:

- **Board** — sortable, searchable, filterable by category, chain and watchlist; every
  row opens a detail view with the full model breakdown, its category anchor, and a
  seven-step farm plan with costs and times.
- **Launch window** — the board split into four age buckets, with each bucket's top three.
- **Categories** — one anchor per category: comparables, multiple, live median change.
- **Live tokens** — the top 24 by market cap, at market values, never ranked.
- **Method & sandbox** — the model in full, with sliders that re-rank the board live
  from the same stored inputs (the submitted board is unchanged).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22 or later, standard library only. The run is deterministic: the same snapshot
bytes always produce the same output bytes.

## Honest limits

- "Records no token" is not proof a protocol has none — the snapshot may simply not
  carry it.
- Implied values are the model's own claim, not a prediction that any token launches.
- Farm plans are starting points. Verify every step on the protocol's own site, and
  never pay to claim an airdrop.
