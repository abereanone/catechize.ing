import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceFile = path.join(currentDir, "..", "bsb.json");

function rewriteDivineNameConventions(text) {
  return String(text ?? "")
    .replace(/\\f \+ \\fr 2:4 \\ft LORD or GOD, with capital letters.*?\\f\*/g, "")
    .replace(/\\f \+ \\fr .*? \\ft That is, the LORD\\f\*/g, "")
    .replace(/\b(the LORD GOD|GOD the LORD)\b/g, "Yah\u2014Yaweh himself\u2014")
    .replace(/\bTHE LORD\b/g, "YAHWEH")
    .replace(/(\b[Tt]he )?\bLORD\b(?! OF LORDS)/g, "Yahweh")
    .replace(/(?<!UNKNOWN )\bGOD\b/g, "Yahweh");
}

function normalizeVerseEntry(rawEntry, chapter, verse) {
  const rawText =
    typeof rawEntry === "string"
      ? rawEntry
      : rawEntry && typeof rawEntry === "object" && typeof rawEntry.text === "string"
        ? rawEntry.text
        : "";

  return {
    chapter,
    verse,
    text: rewriteDivineNameConventions(rawText).trim(),
  };
}

async function run() {
  const raw = await fs.readFile(sourceFile, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("bsb.json must be a top-level object keyed by book code.");
  }

  let verseCount = 0;
  const transformed = {};

  for (const [bookCode, chapterList] of Object.entries(parsed)) {
    if (!Array.isArray(chapterList)) {
      throw new Error(`Book "${bookCode}" is not a chapter array.`);
    }

    transformed[bookCode] = chapterList.map((chapterEntries, chapterIndex) => {
      if (!Array.isArray(chapterEntries)) {
        throw new Error(`Book "${bookCode}" chapter "${chapterIndex + 1}" is not a verse array.`);
      }

      return chapterEntries.map((entry, verseIndex) => {
        verseCount += 1;
        return normalizeVerseEntry(entry, chapterIndex + 1, verseIndex + 1);
      });
    });
  }

  await fs.writeFile(sourceFile, `${JSON.stringify(transformed, null, 2)}\n`, "utf8");

  console.log(`Prepared bsb.json with chapter/verse metadata for ${verseCount} verses.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
