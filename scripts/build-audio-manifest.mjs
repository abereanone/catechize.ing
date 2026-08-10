/**
 * Builds src/generated/audio.json from the staged MP3s.
 *
 * Durations come from ffprobe rather than the MP3 header: these are CD rips
 * and may be VBR, where a header read reports a wrong length. The result is
 * committed, so this runs ad hoc (like import-catechisms.mjs) -- never during
 * a build, which has no access to the staged audio.
 *
 *   node ./scripts/build-audio-manifest.mjs
 *   node ./scripts/build-audio-manifest.mjs --staged ./.audio-staging/bc
 */

import { execFile } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_STAGED_DIR = path.resolve("./.audio-staging/bc");
const OUT_FILE = path.resolve("./src/generated/audio.json");
const CONCURRENCY = 8;
const SLUG_PATTERN = /^([a-z]+)-(\d+)\.mp3$/;

function parseArgs(argv) {
  const args = { staged: DEFAULT_STAGED_DIR, out: OUT_FILE };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--staged" || arg === "--out") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }

      args[arg.slice(2)] = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function probeDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const seconds = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned no usable duration for ${path.basename(filePath)}`);
  }

  return Math.round(seconds * 10) / 10;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const stagedStat = await stat(args.staged).catch(() => null);
  if (!stagedStat?.isDirectory()) {
    throw new Error(`Staged audio not found: ${args.staged}\nRun scripts/stage-audio.mjs --apply first.`);
  }

  const files = (await readdir(args.staged)).filter((name) => SLUG_PATTERN.test(name));

  if (!files.length) {
    throw new Error(`No slug-named MP3s in ${args.staged}.`);
  }

  files.sort((a, b) => {
    const left = SLUG_PATTERN.exec(a);
    const right = SLUG_PATTERN.exec(b);
    return left[1].localeCompare(right[1]) || Number(left[2]) - Number(right[2]);
  });

  const failures = [];

  const entries = await mapWithConcurrency(files, CONCURRENCY, async (name) => {
    const filePath = path.join(args.staged, name);
    const slug = name.replace(/\.mp3$/, "");

    try {
      const [duration, info] = await Promise.all([probeDuration(filePath), stat(filePath)]);
      return [slug, { duration, bytes: info.size }];
    } catch (error) {
      failures.push(`${slug}: ${error.message}`);
      return null;
    }
  });

  if (failures.length) {
    console.error(`${failures.length} file(s) failed to probe -- manifest not written:`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const manifest = Object.fromEntries(entries.filter(Boolean));
  await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const total = Object.values(manifest).reduce((sum, item) => sum + item.duration, 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);

  console.log(
    `Wrote ${Object.keys(manifest).length} entries to ${path.relative(process.cwd(), args.out)} ` +
      `(${hours}h ${minutes}m total).`
  );
}

await main();
