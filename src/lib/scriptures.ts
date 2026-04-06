import bookMap from "@/lib/bible/bookMap.json";
import { normalizeReference } from "@/lib/bible/normalizeRef";
import { findQuestion, getPublishedQuestions, type Question } from "@/lib/questions";

export type ScriptureEntry = {
  key: string;
  slug: string;
  reference: string;
  bookCode: string;
  bookName: string;
  referencePart: string;
  questionSlugs: string[];
  questionCount: number;
  searchText: string;
};

export type ScriptureBookGroup = {
  bookCode: string;
  bookName: string;
  count: number;
  entries: ScriptureEntry[];
};

const BOOK_ORDER = [
  "gen",
  "exo",
  "lev",
  "num",
  "deu",
  "jos",
  "jdg",
  "rut",
  "1sa",
  "2sa",
  "1ki",
  "2ki",
  "1ch",
  "2ch",
  "ezr",
  "neh",
  "est",
  "job",
  "psa",
  "pro",
  "ecc",
  "sng",
  "isa",
  "jer",
  "lam",
  "ezk",
  "dan",
  "hos",
  "jol",
  "amo",
  "oba",
  "jon",
  "mic",
  "nah",
  "hab",
  "zep",
  "hag",
  "zec",
  "mal",
  "mat",
  "mrk",
  "luk",
  "jhn",
  "act",
  "rom",
  "1co",
  "2co",
  "gal",
  "eph",
  "php",
  "col",
  "1th",
  "2th",
  "1ti",
  "2ti",
  "tit",
  "phm",
  "heb",
  "jas",
  "1pe",
  "2pe",
  "1jn",
  "2jn",
  "3jn",
  "jud",
  "rev",
];

const BOOK_DISPLAY_NAMES: Record<string, string> = {
  gen: "Genesis",
  exo: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  deu: "Deuteronomy",
  jos: "Joshua",
  jdg: "Judges",
  rut: "Ruth",
  "1sa": "1 Samuel",
  "2sa": "2 Samuel",
  "1ki": "1 Kings",
  "2ki": "2 Kings",
  "1ch": "1 Chronicles",
  "2ch": "2 Chronicles",
  ezr: "Ezra",
  neh: "Nehemiah",
  est: "Esther",
  job: "Job",
  psa: "Psalm",
  pro: "Proverbs",
  ecc: "Ecclesiastes",
  sng: "Song of Solomon",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  ezk: "Ezekiel",
  dan: "Daniel",
  hos: "Hosea",
  jol: "Joel",
  amo: "Amos",
  oba: "Obadiah",
  jon: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zep: "Zephaniah",
  hag: "Haggai",
  zec: "Zechariah",
  mal: "Malachi",
  mat: "Matthew",
  mrk: "Mark",
  luk: "Luke",
  jhn: "John",
  act: "Acts",
  rom: "Romans",
  "1co": "1 Corinthians",
  "2co": "2 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  php: "Philippians",
  col: "Colossians",
  "1th": "1 Thessalonians",
  "2th": "2 Thessalonians",
  "1ti": "1 Timothy",
  "2ti": "2 Timothy",
  tit: "Titus",
  phm: "Philemon",
  heb: "Hebrews",
  jas: "James",
  "1pe": "1 Peter",
  "2pe": "2 Peter",
  "1jn": "1 John",
  "2jn": "2 John",
  "3jn": "3 John",
  jud: "Jude",
  rev: "Revelation",
};

const bookPattern = Object.keys(bookMap)
  .sort((a, b) => b.length - a.length)
  .map((book) => book.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const referencePattern = new RegExp(`^(${bookPattern})\\s+(.+)$`, "i");
const scriptureEntries = buildScriptureIndex();
const scriptureMap = new Map(scriptureEntries.map((entry) => [entry.slug, entry]));
const scriptureBookGroups = buildScriptureBookGroups(scriptureEntries);

export function listScriptures(): ScriptureEntry[] {
  return scriptureEntries;
}

export function listScriptureBookGroups(): ScriptureBookGroup[] {
  return scriptureBookGroups;
}

export function findScripture(slug: string): ScriptureEntry | null {
  return scriptureMap.get(slug) ?? null;
}

export function getScriptureQuestions(entry: ScriptureEntry): Question[] {
  return entry.questionSlugs
    .map((slug) => findQuestion(slug))
    .filter((question): question is Question => Boolean(question?.published));
}

function buildScriptureIndex(): ScriptureEntry[] {
  const entries = new Map<
    string,
    {
      key: string;
      slug: string;
      reference: string;
      bookCode: string;
      bookName: string;
      referencePart: string;
      questionSlugs: Set<string>;
      searchText: string;
    }
  >();

  getPublishedQuestions().forEach((question) => {
    extractProofReferences(question.answerHtml).forEach((reference) => {
      const normalized = normalizeReferenceChunk(reference);
      if (!normalized) {
        return;
      }

      const existing = entries.get(normalized.key);
      if (existing) {
        existing.questionSlugs.add(question.slug);
        return;
      }

      entries.set(normalized.key, {
        ...normalized,
        questionSlugs: new Set([question.slug]),
      });
    });
  });

  return [...entries.values()]
    .map((entry) => ({
      key: entry.key,
      slug: entry.slug,
      reference: entry.reference,
      bookCode: entry.bookCode,
      bookName: entry.bookName,
      referencePart: entry.referencePart,
      questionSlugs: [...entry.questionSlugs],
      questionCount: entry.questionSlugs.size,
      searchText: entry.searchText,
    }))
    .sort(compareScriptureEntries);
}

function buildScriptureBookGroups(entries: ScriptureEntry[]): ScriptureBookGroup[] {
  const groups = new Map<string, ScriptureBookGroup>();

  entries.forEach((entry) => {
    const existing = groups.get(entry.bookCode);
    if (existing) {
      existing.entries.push(entry);
      existing.count += entry.questionCount;
      return;
    }

    groups.set(entry.bookCode, {
      bookCode: entry.bookCode,
      bookName: entry.bookName,
      count: entry.questionCount,
      entries: [entry],
    });
  });

  return [...groups.values()].sort((a, b) => getBookOrder(a.bookCode) - getBookOrder(b.bookCode));
}

function extractProofReferences(answerHtml: string): string[] {
  const proofsIndex = answerHtml.indexOf("<h2>Proofs</h2>");
  if (proofsIndex === -1) {
    return [];
  }

  const proofSection = answerHtml.slice(proofsIndex);
  const plainText = decodeHtml(stripTags(proofSection));
  const matches = [...plainText.matchAll(/\(([^()]+)\)/g)];
  const references: string[] = [];

  matches.forEach((match) => {
    const content = String(match[1] ?? "");
    content
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => references.push(part));
  });

  return references;
}

function normalizeReferenceChunk(reference: string) {
  const cleaned = reference
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .trim();

  const normalizedReference = normalizeReference(cleaned);
  const match = normalizedReference.match(referencePattern);
  if (!match) {
    return null;
  }

  const rawBook = String(match[1] ?? "").toLowerCase();
  const referencePart = String(match[2] ?? "").trim();
  const bookCode = bookMap[rawBook as keyof typeof bookMap];
  if (!bookCode || !referencePart) {
    return null;
  }

  const bookName = getDisplayBookName(bookCode);
  const referenceText = `${bookName} ${referencePart}`;
  const key = `${bookCode} ${referencePart.toLowerCase()}`;
  const slug = key
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    key,
    slug,
    reference: referenceText,
    bookCode,
    bookName,
    referencePart,
    searchText: buildSearchText(bookCode, bookName, referencePart),
  };
}

function buildSearchText(bookCode: string, bookName: string, referencePart: string): string {
  const aliases = getBookAliases(bookCode);
  const variants = new Set<string>([
    `${bookName} ${referencePart}`,
    ...aliases.map((alias) => `${alias} ${referencePart}`),
  ]);

  return [...variants]
    .map((value) => value.toLowerCase())
    .join(" ");
}

function getBookAliases(bookCode: string): string[] {
  return [...new Set(
    Object.entries(bookMap)
      .filter(([, value]) => value === bookCode)
      .map(([name]) => normalizeAlias(name))
      .filter(Boolean)
  )];
}

function normalizeAlias(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getDisplayBookName(code: string): string {
  return BOOK_DISPLAY_NAMES[code] ?? code;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function compareScriptureEntries(a: ScriptureEntry, b: ScriptureEntry): number {
  const orderA = getBookOrder(a.bookCode);
  const orderB = getBookOrder(b.bookCode);
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return compareReferenceText(a.referencePart, b.referencePart);
}

function compareReferenceText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function getBookOrder(code: string): number {
  const index = BOOK_ORDER.indexOf(code);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
