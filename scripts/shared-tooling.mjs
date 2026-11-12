#!/usr/bin/env node
// The question tooling is the same code in several sites. This keeps the copies
// identical and makes any drift fail loudly.
//
//   node scripts/shared-tooling.mjs check    in any site: are this site's copies
//                                            exactly the shared version? (run by
//                                            `npm run check:questions` and CI)
//   node scripts/shared-tooling.mjs status   compare every site on this machine
//   node scripts/shared-tooling.mjs sync     copy the shared files from the source
//                                            site to all the others (run it from
//                                            the source site)
//
// HOW TO CHANGE THE TOOLING: edit the files in the source site (SOURCE below),
// run `node scripts/shared-tooling.mjs sync` there, then commit in every site it
// lists. Editing a shared file anywhere else makes `check` fail in that site.
//
// HOW TO ADD A SITE: put its folder name in SITES, create the site next to the
// others, give it a scripts/site.config.mjs, and run sync.
//
// Anything that must differ between sites belongs in scripts/site.config.mjs,
// which is never copied.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The site whose copies are the original. */
export const SOURCE = "catechize.ing";

/** Every site that carries the tooling, as folder names side by side. A site
 *  that is not on this machine is skipped. */
export const SITES = [
  "catechize.ing",
  "abolition.ing",
  "suffering.catechize.ing",
  "usa",
  "biblicalcounsel.ing",
  "dorean.ing",
];

/** The shared files, relative to a site's root. This script is one of them. */
export const SHARED_FILES = [
  "scripts/shared-tooling.mjs",
  "scripts/lib/questions-core.mjs",
  "scripts/build-questions.mjs",
  "scripts/check-questions.mjs",
  "scripts/new-question.mjs",
  "src/lib/question-schema.js",
];

const LOCK = "scripts/shared-tooling.lock.json";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PARENT = resolve(ROOT, "..");

const lf = (text) => text.replace(/\r\n/g, "\n");
/** Hash of a file's text with line endings ignored, or null when it is missing. */
function fingerprint(root, file) {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  return createHash("sha256").update(lf(readFileSync(path, "utf8"))).digest("hex").slice(0, 16);
}
const fingerprints = (root) => Object.fromEntries(SHARED_FILES.map((f) => [f, fingerprint(root, f)]));
function readLock(root) {
  const path = join(root, LOCK);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
const differing = (a, b) => SHARED_FILES.filter((f) => a[f] !== b[f]);

// Sites that run Prettier format their own files to their own settings, and those
// settings differ from site to site. The shared files have one form everywhere, so
// each such site leaves them out of its formatting (they are formatted, if at all,
// in SOURCE). sync keeps this list in every site that has a .prettierignore.
const IGNORE_NOTE = `# Shared question tooling: the same file in every question site, changed only in ${SOURCE} (see scripts/shared-tooling.mjs).`;
function ensurePrettierIgnore(root) {
  const path = join(root, ".prettierignore");
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  const lines = lf(text).split("\n");
  const missing = SHARED_FILES.filter((f) => !lines.includes(f));
  if (!missing.length) return false;
  let out = lf(text).replace(/\n*$/, "\n");
  if (!lines.includes(IGNORE_NOTE)) out += `\n${IGNORE_NOTE}\n`;
  out += missing.join("\n") + "\n";
  writeFileSync(path, text.includes("\r\n") ? out.replace(/\n/g, "\r\n") : out);
  return true;
}

function check() {
  const lock = readLock(ROOT);
  if (!lock) {
    console.error(`Shared tooling: ${LOCK} is missing. Run \`node scripts/shared-tooling.mjs sync\` in ${SOURCE}.`);
    return 1;
  }
  const changed = differing(fingerprints(ROOT), lock.files ?? {});
  if (changed.length) {
    console.error("Shared tooling: these files no longer match the shared version:");
    for (const f of changed) console.error(`  ${f}`);
    console.error(
      `\nThey are the same code in every question site, so they are changed in one place only:\n` +
      `edit them in ${SOURCE}, run \`node scripts/shared-tooling.mjs sync\` there, and commit in each site.\n` +
      `A setting that should differ for this site goes in scripts/site.config.mjs instead.`
    );
    return 1;
  }
  console.log(`Shared tooling matches the shared version (${SHARED_FILES.length} files).`);
  return 0;
}

function status() {
  const sourceRoot = join(PARENT, SOURCE);
  if (!existsSync(sourceRoot)) {
    console.error(`The source site ${SOURCE} is not next to this one, so there is nothing to compare with.`);
    return 1;
  }
  const want = fingerprints(sourceRoot);
  let bad = 0;
  for (const site of SITES) {
    const root = join(PARENT, site);
    if (!existsSync(root)) { console.log(`${site.padEnd(26)} not on this machine`); continue; }
    const changed = differing(fingerprints(root), want);
    if (changed.length) bad++;
    console.log(`${site.padEnd(26)} ${changed.length ? `DIFFERS: ${changed.join(", ")}` : "same as " + SOURCE}`);
  }
  return bad ? 1 : 0;
}

function sync() {
  if (resolve(ROOT) !== resolve(join(PARENT, SOURCE))) {
    console.error(`Run sync from ${SOURCE}: that site's copies are the original.`);
    return 1;
  }
  const want = fingerprints(ROOT);
  const missing = SHARED_FILES.filter((f) => !want[f]);
  if (missing.length) { console.error(`Missing in ${SOURCE}: ${missing.join(", ")}`); return 1; }
  const lock = JSON.stringify({ source: SOURCE, files: want }, null, 2) + "\n";

  for (const site of SITES) {
    const root = join(PARENT, site);
    if (!existsSync(root)) { console.log(`${site.padEnd(26)} not on this machine, skipped`); continue; }
    const copied = [];
    if (site !== SOURCE) {
      for (const f of SHARED_FILES) {
        if (fingerprint(root, f) === want[f]) continue;
        const dest = join(root, f);
        // Keep the line endings the destination already uses, so the copy shows
        // up in git as the real change and nothing else.
        const crlf = existsSync(dest) && readFileSync(dest, "utf8").includes("\r\n");
        const text = lf(readFileSync(join(ROOT, f), "utf8"));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, crlf ? text.replace(/\n/g, "\r\n") : text);
        copied.push(f);
      }
    }
    const lockPath = join(root, LOCK);
    const lockChanged = !existsSync(lockPath) || lf(readFileSync(lockPath, "utf8")) !== lock;
    if (lockChanged) writeFileSync(lockPath, lock);
    if (ensurePrettierIgnore(root)) copied.push(".prettierignore");
    const config = existsSync(join(root, "scripts/site.config.mjs")) ? "" : "  (needs scripts/site.config.mjs)";
    console.log(`${site.padEnd(26)} ${copied.length ? `updated: ${copied.join(", ")}` : lockChanged ? "lock written" : "already in step"}${config}`);
  }
  console.log("\nCommit the changes in each site listed above.");
  return 0;
}

const command = process.argv[2];
const run = { check, status, sync }[command];
if (!run) {
  console.error("Usage: node scripts/shared-tooling.mjs check | status | sync");
  process.exit(2);
}
process.exit(run());
