// Launch-window radar: a token launch radar built from the sealed snapshot alone.
//
// The question this radar answers is narrow: if a protocol that records no token issued one
// tomorrow and the market priced it the way it prices the live-token protocols in its own
// category, what would that token be worth — and what should a reader do to farm it first?
// It does not predict whether or when any token launches.
//
// The model, "launch-window-1", is five factors, all derived from the snapshot's own figures:
//
//   1. Category-anchored comparable multiple. For every category, the live-token protocols
//      in that category give a median market-cap-to-TVL ratio. Each comparable's ratio is
//      winsorised at 3.0 (a token trading at 400x its TVL says more about speculation than
//      about the category), and the category median is shrunk toward the global median by
//      n / (n + 3), so a category with one thin comparable leans mostly on the whole market.
//      A protocol with no live comparables in its category takes the global median outright.
//   2. Asymmetric momentum. The 7-day TVL change, clamped to [-50, +100]. Gains add at 0.6
//      weight; losses subtract at 1.2 weight: a protocol bleeding TVL is a worse farming bet
//      than a flat one, and a hot week is not worth double-counting.
//   3. Launch window. A hump over the protocol's age with no token: it rises from 0.55 at
//      listing toward 1.00 at 540 days — a protocol that has run a year and a half with no
//      token has the most pent-up launch value — then decays toward 0.85, because a protocol
//      that has run five years without issuing one may simply never issue one.
//   4. Category heat. The median 7-day change of the live-token protocols in the same
//      category, clamped to [-20, +30], at half weight: it asks whether the category itself
//      is attracting capital right now, not just this one protocol.
//   5. Distribution breadth. One plus 0.04 per extra chain, capped at four extra chains:
//      a protocol live on more chains can distribute a launch to more wallets.
//
//   implied = TVL x category_multiple x momentum x window x heat x breadth
//
// No protocol name is ever special-cased. The same five factors score every row, and the
// dashboard's model sandbox recomputes them live from the same stored inputs, so the page
// and the board are the same arithmetic.

/** One protocol as the sealed snapshot records it: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunables, stated on the dashboard and movable in its sandbox. */
export interface ModelTuning {
  /** No comparable ratio counts above this market-cap-to-TVL. */
  winsor_cap: number;
  /** Shrinkage strength: a category median's weight is n / (n + shrink_k). */
  shrink_k: number;
  /** Momentum weight on a positive 7-day change. */
  gain_weight: number;
  /** Momentum weight on a negative 7-day change. */
  loss_weight: number;
  /** The age, in days, at which the launch window peaks. */
  window_peak_days: number;
  /** The launch window at listing day. */
  window_start: number;
  /** The launch window's floor for very old protocols. */
  window_floor: number;
  /** Half-weight scale for category heat, in per cent. */
  heat_weight: number;
  /** Breadth bonus per extra chain. */
  breadth_step: number;
  /** Breadth bonus stops after this many extra chains. */
  breadth_cap: number;
}

export const TUNING: ModelTuning = {
  winsor_cap: 3.0,
  shrink_k: 3,
  gain_weight: 0.6,
  loss_weight: 1.2,
  window_peak_days: 540,
  window_start: 0.55,
  window_floor: 0.85,
  heat_weight: 0.5,
  breadth_step: 0.04,
  breadth_cap: 4,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'launch-window-1';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    momentum_multiplier: number;
    window_multiplier: number;
    heat_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page recomputes implied value from these. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  comparables: number;
  momentum_multiplier: number;
  window_multiplier: number;
  heat_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** One category's comparable anchor, for the dashboard's Categories tab. */
export interface CategoryAnchor {
  category: string;
  comparables: number;
  multiple: number;
  median_change_7d: number | null;
  pre_token_count: number;
  pre_token_tvl: number;
  top_slug: string;
  top_name: string;
  top_implied: number;
}

/** A live-token protocol, shown at the market's own value, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  tuning: ModelTuning;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  watchlist_slugs: string[];
  board_size: number;
  live_size: number;
  rows: RadarRow[];
  categories: CategoryAnchor[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty array of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is another protocol's pool. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the house's own watchlist rule treats as a wrapped, staked or bridged product. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol name must not begin with, per the house's watchlist rule. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of a token that already trades,
 * or an exchange itself: not a protocol still waiting on a launch of its own.
 */
export function isProductOfTradedToken(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  return EXCHANGE_NAMES.some((e) => p.name.startsWith(e));
}

/** Whether a protocol is one the board may rank: pre-token, not a versioned pool, not a product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !VERSIONED.test(p.name) && !isProductOfTradedToken(p);
}

/** The live-token protocols usable as comparables: a positive market cap, a TVL, no version marker.
 * A recorded market cap of zero is a token the market prices at nothing: it carries no
 * pricing information and is not a comparable. */
function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      !isPreToken(p) &&
      p.category !== 'CEX' &&
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      !VERSIONED.test(p.name),
  );
}

/**
 * The category anchors: one winsorised, shrunk median market-cap-to-TVL per category, plus
 * the global median for categories with no live comparables at all.
 */
export function categoryAnchors(snapshot: Snapshot, tuning: ModelTuning): { global: number; byCategory: Map<string, { multiple: number; n: number; medianChange: number | null }> } {
  const live = comparables(snapshot);
  const global = median(live.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, tuning.winsor_cap)));
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const arr = byCat.get(key);
    if (arr) arr.push(p);
    else byCat.set(key, [p]);
  }
  const byCategory = new Map<string, { multiple: number; n: number; medianChange: number | null }>();
  for (const [cat, rows] of byCat) {
    const ratios = rows.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, tuning.winsor_cap));
    const catMedian = median(ratios);
    const weight = rows.length / (rows.length + tuning.shrink_k);
    const changes = rows.map((p) => p.change_7d).filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
    byCategory.set(cat, {
      multiple: round4(weight * catMedian + (1 - weight) * global),
      n: rows.length,
      medianChange: changes.length > 0 ? round4(median(changes)) : null,
    });
  }
  return { global: round4(global), byCategory };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The launch-window factor for an age in days: rises to 1.00 at the peak, then decays. */
export function windowFactor(age: number | null, tuning: ModelTuning): number {
  const a = age ?? 365;
  if (a <= tuning.window_peak_days) {
    return round4(tuning.window_start + (1 - tuning.window_start) * Math.pow(a / tuning.window_peak_days, 0.7));
  }
  const past = Math.min(a - tuning.window_peak_days, 1460);
  return round4(Math.max(tuning.window_floor, 1 - (1 - tuning.window_floor) * (past / 1460)));
}

/** The momentum factor for a 7-day change in per cent: losses count double, gains half. */
export function momentumFactor(change7d: number | null, tuning: ModelTuning): { pct: number; factor: number } {
  const raw = finite(change7d, 0);
  const pct = Math.min(100, Math.max(-50, raw));
  const weight = pct >= 0 ? tuning.gain_weight : tuning.loss_weight;
  return { pct, factor: round4(1 + (pct / 100) * weight) };
}

/** The category-heat factor from the live comparables' median 7-day change. */
export function heatFactor(medianChange: number | null, tuning: ModelTuning): number {
  if (medianChange === null) return 1;
  const clamped = Math.min(30, Math.max(-20, medianChange));
  return round4(1 + (clamped / 100) * tuning.heat_weight);
}

/** The distribution-breadth factor for a chain count. */
export function breadthFactor(chainCount: number, tuning: ModelTuning): number {
  const extra = Math.min(Math.max(chainCount - 1, 0), tuning.breadth_cap);
  return round4(1 + extra * tuning.breadth_step);
}

/** One protocol's implied value and every factor behind it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  anchors: { global: number; byCategory: Map<string, { multiple: number; n: number; medianChange: number | null }> },
  tuning: ModelTuning,
): {
  implied: number;
  multiple: number;
  comparables: number;
  growthPct: number;
  momentum: number;
  window: number;
  heat: number;
  breadth: number;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const anchor = anchors.byCategory.get(p.category ?? 'Uncategorised');
  const multiple = anchor ? anchor.multiple : anchors.global;
  const comparables = anchor ? anchor.n : 0;
  const { pct, factor: momentum } = momentumFactor(p.change_7d, tuning);
  const window = windowFactor(age, tuning);
  const heat = heatFactor(anchor ? anchor.medianChange : null, tuning);
  const breadth = breadthFactor(p.chains.length, tuning);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * window * heat * breadth));
  return { implied, multiple, comparables, growthPct: pct, momentum, window, heat, breadth, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, tuning: ModelTuning = TUNING): BoardRow[] {
  const anchors = categoryAnchors(snapshot, tuning);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, anchors, tuning) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.multiple,
      comparables: s.v.comparables,
      growth_pct: s.v.growthPct,
      momentum_multiplier: s.v.momentum,
      window_multiplier: s.v.window,
      heat_multiplier: s.v.heat,
      breadth_multiplier: s.v.breadth,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page for its points.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 100;
}

/** Typical gas to move funds on a chain: Ethereum costs real money, the rest cost cents. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $6 to $12 of gas';
  if (c === 'solana') return 'under $1 of gas';
  return 'about $1 to $3 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 540) return 60;
  return 45;
}

/** The category's one core action, in words a farmer can follow without a guide. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC into ${name}'s ${chain} market and leave the deposit earning.`;
  if (c.includes('dex') || c.includes('yield')) return `Add $${capital} of liquidity to ${name}'s deepest ${chain} pool and stake the receipt if the app offers it.`;
  if (c.includes('bridge')) return `Send $${capital} across ${name} to ${chain}, then put the bridged funds to work in the destination app instead of bridging straight back.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as collateral on ${name} and open one small hedged position, then close it the same week.`;
  if (c.includes('prediction')) return `Back one outcome with $${capital} on ${name}'s ${chain} market and let the position settle.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s tokenised asset on ${chain} and hold the receipt in the farming wallet.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Allocate $${capital} into a ${name} vault on ${chain} and keep the vault shares untouched.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} through ${name} on ${chain} and keep the staking receipt in the wallet.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of ${name}'s stable asset on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis position on ${chain} and keep it open.`;
  return `Put $${capital} of USDC to work in ${name}'s main ${chain} product and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline on paper.`,
      cost: 'nothing but the wallet',
      time: '5 minutes',
    },
    {
      text: `Move $${capital} of USDC into the farming wallet on ${chain}, ready to deploy.`,
      cost: gasFor(chain),
      time: '10 minutes',
    },
    { text: action, cost: `$${capital} of capital and ${gasFor(chain)}`, time: '15 minutes to set up' },
    {
      text: `Do one qualifying action every week — a deposit, a swap, a borrow or a vote — so the wallet reads as active, not one-off.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Work through ${p.name}'s own quests or points page, using only links the protocol itself publishes on its site.`,
      cost: 'nothing but the time',
      time: '20 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open the protocol's own rewards page from its official site and claim only there; never pay anyone to claim, and write the wallet, the dates and every transaction hash in a farm log.`,
      cost: 'gas for the claim alone',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live tokens tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, carrying every input the page recomputes from. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    momentum_multiplier: row.model.momentum_multiplier,
    window_multiplier: row.model.window_multiplier,
    heat_multiplier: row.model.heat_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, tuning: ModelTuning = TUNING): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, tuning);
  const anchors = categoryAnchors(snapshot, tuning);
  const live = liveRows(snapshot);
  const byCat = new Map<string, BoardRow[]>();
  for (const r of board) {
    const key = r.category ?? 'Uncategorised';
    const arr = byCat.get(key);
    if (arr) arr.push(r);
    else byCat.set(key, [r]);
  }
  const categories: CategoryAnchor[] = [...byCat.entries()]
    .map(([category, rows]) => {
      const anchor = anchors.byCategory.get(category);
      const top = rows[0]!;
      return {
        category,
        comparables: anchor ? anchor.n : 0,
        multiple: anchor ? anchor.multiple : anchors.global,
        median_change_7d: anchor ? anchor.medianChange : null,
        pre_token_count: rows.length,
        pre_token_tvl: rows.reduce((s, r) => s + r.tvl_usd, 0),
        top_slug: top.slug,
        top_name: top.name,
        top_implied: top.implied_value_usd,
      };
    })
    .sort((a, b) => b.pre_token_tvl - a.pre_token_tvl);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    tuning,
    model_version: MODEL_VERSION,
    global_multiple: anchors.global,
    watchlist_size: snapshot.watchlist.length,
    watchlist_slugs: [...snapshot.watchlist],
    board_size: board.length,
    live_size: live.length,
    rows: board.map(radarRow),
    categories,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100 to 4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
