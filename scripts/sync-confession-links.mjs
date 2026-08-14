// Pulls the catechism -> confession mapping into src/data so the question pages
// can render it at build without a network call.
//
//   node ./scripts/sync-confession-links.mjs
//
// confess.catechize.ing owns the mapping: it holds the confession text and the
// alignment spine that produced it, and it publishes /catechism-links.json. This
// script only copies it in.
//
// A sibling checkout wins over the published feed, so that a change made in the
// confession repo can be seen here before it is deployed. Set CONFESSION_LINKS
// to override either.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "src", "data", "confession-links.json");

const PUBLISHED = "https://confess.catechize.ing/catechism-links.json";
const local = [
  process.env.CONFESSION_LINKS,
  path.resolve(root, "..", "confession", "apps", "web", "dist", "catechism-links.json"),
].filter(Boolean);

async function load() {
  for (const candidate of local) {
    try {
      const raw = await readFile(candidate, "utf8");
      return { raw, from: path.relative(root, candidate) };
    } catch {
      // Not built, or not checked out next to this repo. Fall through.
    }
  }

  try {
    const response = await fetch(PUBLISHED);
    if (!response.ok) throw new Error(`returned ${response.status}`);
    return { raw: await response.text(), from: PUBLISHED };
  } catch (error) {
    // The checked-in copy is the last line of defence. A build here must not
    // fail because the other site is mid-deploy, briefly down, or has not been
    // deployed yet — it should just carry the mapping it already had.
    const raw = await readFile(out, "utf8").catch(() => null);
    if (!raw) throw new Error(`${PUBLISHED} unavailable (${error.message}) and no local copy`);
    console.warn(`warning: ${PUBLISHED} unavailable (${error.message}) — keeping the checked-in copy`);
    return { raw, from: `${path.relative(root, out)} (unchanged)` };
  }
}

const { raw, from } = await load();
const data = JSON.parse(raw);

const questions = data.mappings.reduce((total, mapping) => total + mapping.questions.length, 0);

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(`synced ${data.mappings.length} mappings, ${questions} linked questions`);
console.log(`  from ${from}`);
console.log(`  to   ${path.relative(root, out)}`);
