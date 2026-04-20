import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const questionsFile = path.join(rootDir, "src", "generated", "questions.json");
const bookMapFile = path.join(rootDir, "src", "lib", "bible", "bookMap.json");
const sourceBibleFile = path.join(rootDir, "bsb-data-pipeline", "bsb.json");
const outputFile = path.join(rootDir, "src", "generated", "bible-cited.json");
const chapterPreviewVerseLimit = 15;

const singleChapterBooks = new Set([
  "obadiah",
  "oba",
  "philemon",
  "phm",
  "2 john",
  "2jn",
  "3 john",
  "3jn",
  "jude",
  "jud",
]);

const bsbCodeOverrides = {
  mrk: "MAR",
  nah: "NAM",
  phm: "PHL",
};

let referencePattern = null;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLeadingRomanNumeral(value) {
  return value.replace(/^(iii|ii|i)\s+/i, (match) => {
    const numeral = match.trim().toLowerCase();
    if (numeral === "i") {
      return "1 ";
    }
    if (numeral === "ii") {
      return "2 ";
    }
    if (numeral === "iii") {
      return "3 ";
    }
    return match;
  });
}

function normalizeBookKey(book) {
  return normalizeLeadingRomanNumeral(book)
    .replace(/\./g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBookName(bookMap, book) {
  const normalizedKey = normalizeBookKey(book);
  return (
    bookMap[normalizedKey] ??
    bookMap[normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1)]
  );
}

function splitReferenceParts(reference) {
  const match = String(reference).match(
    /^((?:(?:[1-3]|iii|ii|i)\s+)?[a-z.]+(?:\s+[a-z.]+)*)\s+(\d.*)$/i
  );

  if (!match) {
    return null;
  }

  const book = String(match[1] ?? "").trim();
  const chapterAndVerse = String(match[2] ?? "").trim().replace(/\s*,\s*/g, ", ");

  if (!book || !chapterAndVerse) {
    return null;
  }

  return { book, chapterAndVerse };
}

function normalizeReference(bookMap, reference) {
  const lower = reference.trim().toLowerCase().replace(/\u2013|\u2014/g, "-");
  const parts = splitReferenceParts(lower);
  if (!parts) {
    return reference;
  }

  const { book } = parts;
  const normalizedBookKey = normalizeBookKey(book);
  let chapterAndVerse = parts.chapterAndVerse;

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(normalizedBookKey)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  const normalizedBook = normalizeBookName(bookMap, book);
  if (!normalizedBook) {
    return reference;
  }

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(normalizedBook)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  return `${normalizedBook} ${chapterAndVerse}`;
}

function getReferencePattern(bookMap) {
  if (!referencePattern) {
    const bookPattern = Object.keys(bookMap)
      .sort((a, b) => b.length - a.length)
      .map((book) => escapeRegExp(book))
      .join("|");
    referencePattern = new RegExp(`^(${bookPattern})\\s+(.+)$`, "i");
  }

  return referencePattern;
}

function normalizeReferenceChunk(bookMap, reference) {
  const cleaned = cleanReference(reference);
  if (!cleaned) {
    return null;
  }

  const normalizedReference = normalizeReference(bookMap, cleaned);
  const match = normalizedReference.match(getReferencePattern(bookMap));
  if (!match) {
    return null;
  }

  const rawBook = String(match[1] ?? "").toLowerCase();
  const referencePart = String(match[2] ?? "").trim();
  const bookCode = bookMap[rawBook];
  if (!bookCode || !referencePart) {
    return null;
  }

  return `${bookCode} ${referencePart.toLowerCase()}`;
}

function normalizeLookupKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractParentheticalReferences(html) {
  const plainText = decodeHtml(stripTags(String(html ?? "")));
  const matches = [...plainText.matchAll(/\(([^()]+)\)/g)];
  const references = [];

  matches.forEach((match) => {
    const content = String(match[1] ?? "");
    let lastBook = null;

    content
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const cleanedPart = cleanReference(part).replace(/(?:,\s*)?etc\.?$/i, "").trim();
        if (!cleanedPart) {
          return;
        }

        const explicit = splitReferenceParts(cleanedPart);
        if (explicit) {
          lastBook = explicit.book;
          references.push(cleanedPart);
          return;
        }

        if (lastBook && /^\d/.test(cleanedPart)) {
          references.push(`${lastBook} ${cleanedPart}`);
          return;
        }

        references.push(cleanedPart);
      });
  });

  return references;
}

function cleanReference(reference) {
  return String(reference ?? "")
    .replace(/\|.*$/g, "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/(?:,\s*)?&c\.?/gi, "")
    .replace(/(\d+)\s+and\s+(\d+)/gi, "$1, $2")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function expandReferenceVariants(bookMap, normalizedReference) {
  const variants = new Set();
  const value = normalizeLookupKey(normalizedReference);
  if (!value) {
    return variants;
  }

  const chapterOnlyMatch = value.match(/^([a-z0-9]+)\s+(\d+)$/);
  if (chapterOnlyMatch) {
    variants.add(value);
    return variants;
  }

  const match = value.match(/^([a-z0-9]+)\s+(\d+):(.+)$/);
  if (!match) {
    return variants;
  }

  variants.add(value);

  const bookCode = match[1];
  const chapter = match[2];
  const versePart = match[3];

  if (!versePart.includes(",")) {
    return variants;
  }

  versePart
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .forEach((piece) => {
      if (piece.includes(":")) {
        const explicitBookVariant = normalizeReferenceChunk(bookMap, piece);
        if (explicitBookVariant) {
          variants.add(explicitBookVariant);
          return;
        }
        variants.add(`${bookCode} ${piece}`);
        return;
      }

      variants.add(`${bookCode} ${chapter}:${piece}`);
    });

  return variants;
}

function toBsbBookCode(bookCode) {
  return bsbCodeOverrides[bookCode] ?? String(bookCode).toUpperCase();
}

function normalizeVersion(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    return "";
  }

  return cleaned.toUpperCase() === "BSB" ? "" : cleaned;
}

function getEntryParts(entry) {
  if (typeof entry === "string") {
    return { text: entry, version: "" };
  }

  if (entry && typeof entry === "object") {
    const text = typeof entry.text === "string" ? entry.text : "";
    const version = normalizeVersion(entry.version);
    return { text, version };
  }

  return { text: "", version: "" };
}

function resolveVerseData(bible, normalizedReference) {
  const normalizedKey = normalizeLookupKey(normalizedReference);
  const chapterOnlyMatch = normalizedKey.match(/^([a-z0-9]+)\s+(\d+)$/);
  if (chapterOnlyMatch) {
    const bookCode = toBsbBookCode(chapterOnlyMatch[1]);
    const chapterNumber = Number.parseInt(chapterOnlyMatch[2], 10);
    if (Number.isNaN(chapterNumber) || chapterNumber <= 0) {
      return { text: "", version: "" };
    }

    const book = bible[bookCode];
    if (!Array.isArray(book)) {
      return { text: "", version: "" };
    }

    const chapterEntries = book[chapterNumber - 1];
    if (!Array.isArray(chapterEntries)) {
      return { text: "", version: "" };
    }

    const verseTextParts = [];
    let version = "";
    const maxVerse = Math.min(chapterEntries.length, chapterPreviewVerseLimit);
    for (let verseNumber = 1; verseNumber <= maxVerse; verseNumber += 1) {
      const entry = chapterEntries[verseNumber - 1];
      const { text, version: entryVersion } = getEntryParts(entry);

      const cleaned = text.trim();
      if (!cleaned) {
        continue;
      }

      if (!version && entryVersion) {
        version = entryVersion;
      }

      verseTextParts.push(`${verseNumber} ${cleaned}`);
    }

    if (chapterEntries.length > chapterPreviewVerseLimit && verseTextParts.length) {
      verseTextParts.push("...");
    }

    return { text: verseTextParts.join(" "), version };
  }

  const match = normalizedKey.match(/^([a-z0-9]+)\s+(\d+):(.+)$/);
  if (!match) {
    return { text: "", version: "" };
  }

  const bookCode = toBsbBookCode(match[1]);
  const chapterNumber = Number.parseInt(match[2], 10);
  if (Number.isNaN(chapterNumber) || chapterNumber <= 0) {
    return { text: "", version: "" };
  }

  const book = bible[bookCode];
  if (!Array.isArray(book)) {
    return { text: "", version: "" };
  }

  const chapterEntries = book[chapterNumber - 1];
  if (!Array.isArray(chapterEntries)) {
    return { text: "", version: "" };
  }

  const verseTextParts = [];
  let version = "";
  const segments = String(match[3])
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);

  function appendSegment(chapterValue, segment) {
    const chapterEntriesForValue = book[chapterValue - 1];
    if (!Array.isArray(chapterEntriesForValue)) {
      return;
    }

    if (bookCode === "PSA" && segment.toLowerCase() === "title") {
      appendVerse(chapterValue, 1);
      return;
    }

    const ffMatch = segment.match(/^(\d+)ff$/i);
    if (ffMatch) {
      const start = Number.parseInt(ffMatch[1], 10);
      if (!Number.isNaN(start) && start > 0) {
        for (let verseNumber = start; verseNumber <= chapterEntriesForValue.length; verseNumber += 1) {
          appendVerse(chapterValue, verseNumber);
        }
      }
      return;
    }

    const crossChapterMatch = segment.match(/^(\d+)-(\d+):(\d+)$/);
    if (crossChapterMatch) {
      const startVerse = Number.parseInt(crossChapterMatch[1], 10);
      const endChapter = Number.parseInt(crossChapterMatch[2], 10);
      const endVerse = Number.parseInt(crossChapterMatch[3], 10);
      if (
        !Number.isNaN(startVerse) &&
        !Number.isNaN(endChapter) &&
        !Number.isNaN(endVerse) &&
        startVerse > 0 &&
        endChapter >= chapterValue &&
        endVerse > 0
      ) {
        for (let chapter = chapterValue; chapter <= endChapter; chapter += 1) {
          const chapterEntries = book[chapter - 1];
          if (!Array.isArray(chapterEntries)) {
            break;
          }

          const start = chapter === chapterValue ? startVerse : 1;
          const end = chapter === endChapter ? endVerse : chapterEntries.length;
          for (let verseNumber = start; verseNumber <= end; verseNumber += 1) {
            appendVerse(chapter, verseNumber);
          }
        }
      }
      return;
    }

    const rangeMatch = segment.match(/^(\d+)(?:-(\d+))?$/);
    if (!rangeMatch) {
      return;
    }

    const start = Number.parseInt(rangeMatch[1], 10);
    const end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0) {
      return;
    }

    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    for (let verseNumber = rangeStart; verseNumber <= rangeEnd; verseNumber += 1) {
      appendVerse(chapterValue, verseNumber);
    }
  }

  function appendVerse(chapterValue, verseValue) {
    const chapter = book[chapterValue - 1];
    if (!Array.isArray(chapter)) {
      return;
    }
    const entry = chapter[verseValue - 1];
    const { text, version: entryVersion } = getEntryParts(entry);

    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }

    if (!version && entryVersion) {
      version = entryVersion;
    }

    verseTextParts.push(`${verseValue} ${cleaned}`);
  }

  for (const segment of segments) {
    const chapterQualifiedMatch = segment.match(/^(\d+):(.+)$/);
    if (chapterQualifiedMatch) {
      const chapterValue = Number.parseInt(chapterQualifiedMatch[1], 10);
      const qualifiedSegment = chapterQualifiedMatch[2].trim();
      if (!Number.isNaN(chapterValue) && chapterValue > 0 && qualifiedSegment) {
        appendSegment(chapterValue, qualifiedSegment);
      }
      continue;
    }

    appendSegment(chapterNumber, segment);
  }

  return { text: verseTextParts.join(" "), version };
}

async function run() {
  const [questionsRaw, bookMapRaw, bibleRaw] = await Promise.all([
    fs.readFile(questionsFile, "utf8"),
    fs.readFile(bookMapFile, "utf8"),
    fs.readFile(sourceBibleFile, "utf8"),
  ]);

  const questions = JSON.parse(questionsRaw);
  const bookMap = JSON.parse(bookMapRaw);
  const bible = JSON.parse(bibleRaw);

  if (!Array.isArray(questions)) {
    throw new Error("src/generated/questions.json must be an array. Run npm run build:questions first.");
  }

  const allReferences = new Set();

  for (const question of questions) {
    const htmlSegments = [question?.answerHtml, question?.longHtml];
    for (const html of htmlSegments) {
      extractParentheticalReferences(html).forEach((rawReference) => {
        const normalizedKey = normalizeReferenceChunk(bookMap, rawReference);
        if (!normalizedKey) {
          return;
        }

        expandReferenceVariants(bookMap, normalizedKey).forEach((variant) =>
          allReferences.add(variant)
        );
      });
    }
  }

  const verses = {};
  let missingCount = 0;
  const missingReferences = [];

  [...allReferences]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach((reference) => {
      const verseData = resolveVerseData(bible, reference);
      if (!verseData.text) {
        missingCount += 1;
        missingReferences.push(reference);
        return;
      }
      verses[reference] = verseData.version
        ? { text: verseData.text, version: verseData.version }
        : verseData.text;
    });

  const output = {
    source: "bsb-data-pipeline/bsb.json",
    generatedAt: new Date().toISOString(),
    verseCount: Object.keys(verses).length,
    verses,
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `Generated ${Object.keys(verses).length} cited verse lookups (${missingCount} unresolved references skipped).`
  );

  if (process.env.DEBUG_MISSING_BIBLE_REFS === "1" && missingReferences.length) {
    console.log("Unresolved references:");
    missingReferences.forEach((reference) => console.log(`- ${reference}`));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
