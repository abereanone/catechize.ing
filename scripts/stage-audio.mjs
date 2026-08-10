/**
 * Stages the Orrick "Baptist Catechism Set to Music" MP3s under R2-ready keys.
 *
 * Source filenames are truncated mid-word and inconsistently cased, so rather
 * than rename the originals in place (which would break the iTunes library
 * they live in) this copies them into a staging directory keyed by question
 * slug: disc 1 track N -> bc-N, disc 2 track N -> bc-(N + 61).
 *
 * Dry run by default. Pass --apply to actually copy.
 *
 *   node ./scripts/stage-audio.mjs --src "<album folder>"
 *   node ./scripts/stage-audio.mjs --src "<album folder>" --apply
 */

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DISC_OFFSETS = { 1: 0, 2: 61 };
const EXPECTED_TRACKS = { 1: 61, 2: 53 };
const QUESTIONS_DIR = path.resolve("./src/content/questions");
const DEFAULT_OUT_DIR = path.resolve("./.audio-staging");
const TRACK_PATTERN = /^([12])-(\d{2})\s+(.*)$/;

function parseArgs(argv) {
  const args = { apply: false, src: null, out: DEFAULT_OUT_DIR, prefix: "bc" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--src" || arg === "--out" || arg === "--prefix") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }

      args[arg.slice(2)] = arg === "--prefix" ? value : path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.src) {
    throw new Error("--src is required (path to the album folder).");
  }

  return args;
}

async function collectMp3s(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMp3s(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) {
      files.push(full);
    }
  }

  return files;
}

/** Discs are identified by the track prefix, not the folder name -- the folder
 *  names differ only by capitalisation and an unclosed paren. */
function parseTrack(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const match = TRACK_PATTERN.exec(base);

  if (!match) {
    return null;
  }

  return {
    filePath,
    disc: Number(match[1]),
    track: Number(match[2]),
    label: match[3].trim(),
  };
}

function normalizeForCompare(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;

  while (index < limit && a[index] === b[index]) {
    index += 1;
  }

  return index;
}

async function readQuestionTitle(slug) {
  const file = path.join(QUESTIONS_DIR, `${slug}.md`);

  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(file, "utf8");
    const match = /^title:\s*(.+)$/m.exec(raw);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const srcStat = await stat(args.src).catch(() => null);
  if (!srcStat?.isDirectory()) {
    throw new Error(`Source is not a directory: ${args.src}`);
  }

  const tracks = [];
  const skipped = [];

  for (const file of await collectMp3s(args.src)) {
    const parsed = parseTrack(file);
    if (parsed) {
      tracks.push(parsed);
    } else {
      skipped.push(file);
    }
  }

  const problems = [];
  const warnings = [];
  const seen = new Map();
  const plan = [];

  for (const entry of tracks.sort((a, b) => a.disc - b.disc || a.track - b.track)) {
    const offset = DISC_OFFSETS[entry.disc];
    const number = offset + entry.track;
    const slug = `${args.prefix}-${number}`;
    const target = path.join(args.out, args.prefix, `${slug}.mp3`);

    if (seen.has(slug)) {
      problems.push(`${slug}: two tracks map here -- ${seen.get(slug)} and ${path.basename(entry.filePath)}`);
      continue;
    }

    seen.set(slug, path.basename(entry.filePath));

    const title = await readQuestionTitle(slug);

    if (title === null) {
      problems.push(`${slug}: no question file at src/content/questions/${slug}.md`);
    } else {
      // Track names are truncated, so only the shared prefix can be compared.
      const trackKey = normalizeForCompare(entry.label);
      const titleKey = normalizeForCompare(title);
      const shared = commonPrefixLength(trackKey, titleKey);

      if (trackKey.length > 0 && shared / trackKey.length < 0.6) {
        warnings.push(`${slug}: title drift\n    track: ${entry.label}\n    question: ${title}`);
      }
    }

    plan.push({ slug, from: entry.filePath, to: target });
  }

  for (const [disc, expected] of Object.entries(EXPECTED_TRACKS)) {
    const found = tracks.filter((entry) => entry.disc === Number(disc)).length;

    if (found !== expected) {
      problems.push(`disc ${disc}: expected ${expected} tracks, found ${found}`);
    }
  }

  for (const file of skipped) {
    warnings.push(`unrecognised filename, ignored: ${path.basename(file)}`);
  }

  for (const warning of warnings) {
    console.warn(`WARN  ${warning}`);
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) -- nothing copied:`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n${plan.length} tracks map cleanly to ${args.prefix}-1 .. ${args.prefix}-${plan.length}.`);

  if (!args.apply) {
    for (const item of plan) {
      console.log(`  ${path.basename(item.from)}\n    -> ${path.relative(process.cwd(), item.to)}`);
    }
    console.log(`\nDry run. Re-run with --apply to copy into ${path.relative(process.cwd(), args.out)}.`);
    return;
  }

  await mkdir(path.join(args.out, args.prefix), { recursive: true });

  let copied = 0;
  for (const item of plan) {
    await copyFile(item.from, item.to);
    copied += 1;
  }

  console.log(`Copied ${copied} files into ${path.relative(process.cwd(), args.out)}.`);
}

await main();
