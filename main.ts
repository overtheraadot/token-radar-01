// Launch-window radar entry (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every rankable pre-token protocol with the model in
// lib/radar.ts, and writes the entry's outputs:
//
//   /output/board.json     the ranked board (rows 1..N by implied value)
//   /output/data.js        the same board, compact, for the dashboard page
//   /output/dashboard/    this repository's dashboard/ (index.html, app.css, app.js)
//   /output/screenshots/  this repository's screenshots/ (board, detail, filtered)
//   /output/dossier.json  the judge's dossier, built by vendor/makefun-board.ts
//
// The run is deterministic: the same snapshot bytes always produce the same output bytes,
// so the grader's two runs agree. Nothing here touches the network, the clock, or any
// wallet.
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, parseSnapshot } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's own caps, from the kit's reference/gate.json via RULES.txt. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524_288;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A whole PNG or JPEG, by magic bytes: the gate refuses anything else. */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  return false;
}

/** --name <value> or --name=<value> out of the arguments, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`launch radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into `to`, skipping dot-names, one level deep. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      for (const sub of copyTree(path, join(to, name))) copied.push(`${name}/${sub}`);
    } else if (st.isFile()) {
      copyFileSync(path, join(to, name));
      copied.push(name);
    }
  }
  return copied;
}

const dashboardFiles = copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashboardFiles.includes('index.html')) fail('dashboard/ holds no index.html');
if (!dashboardFiles.some((f) => f.endsWith('.css'))) fail('dashboard/ holds no .css file');
if (!dashboardFiles.some((f) => f.endsWith('.js'))) fail('dashboard/ holds no .js file');

const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
if (shots.length > SCREENSHOT_MAX) fail(`screenshots/ holds ${shots.length} images: at most ${SCREENSHOT_MAX}`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  const buf = readFileSync(join(out, 'screenshots', name));
  if (buf.length > SCREENSHOT_MAX_BYTES) fail(`screenshots/${name} is ${buf.length} bytes: at most ${SCREENSHOT_MAX_BYTES}`);
  if (!looksLikeImage(buf)) fail(`screenshots/${name} is not a whole PNG or JPEG`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const top = board[0]!;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked\n` +
    `launch radar: rank 1 is ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied value\n` +
    `launch radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
