export const BIBLE_ABBREVIATION = "BSB";
const referenceCache = new Map<string, VerseData | null>();

export type VerseData = {
  text: string;
  version: string;
};

type VerseEntry =
  | string
  | {
      text?: string;
      version?: string;
    };

type CitedBibleData = {
  verses?: Record<string, VerseEntry>;
};

let bibleLookupPromise: Promise<Map<string, VerseEntry>> | null = null;

function normalizeLookupKey(reference: string): string {
  return reference
    .trim()
    .replace(/\|.*$/g, "")
    .replace(/(\d+)\s+and\s+(\d+)/gi, "$1, $2")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function toVerseData(entry: VerseEntry | undefined): VerseData | null {
  if (typeof entry === "string") {
    const text = entry.trim();
    return text ? { text, version: BIBLE_ABBREVIATION } : null;
  }

  if (!entry || typeof entry !== "object" || typeof entry.text !== "string") {
    return null;
  }

  const text = entry.text.trim();
  if (!text) {
    return null;
  }

  const rawVersion = typeof entry.version === "string" ? entry.version.trim() : "";
  const version = rawVersion || BIBLE_ABBREVIATION;

  return { text, version };
}

async function getBibleLookup(): Promise<Map<string, VerseEntry>> {
  if (!bibleLookupPromise) {
    bibleLookupPromise = import("@/generated/bible-cited.json")
      .then((module) => {
        const data = (module.default ?? {}) as CitedBibleData;
        return new Map<string, VerseEntry>(Object.entries(data.verses ?? {}));
      })
      .catch(() => new Map<string, VerseEntry>());
  }

  return bibleLookupPromise;
}

function getSingleChapterVerseKeys(reference: string): string[] {
  const match = reference.match(/^([1-3]?[a-z]+)\s+(\d+):(.+)$/);
  if (!match) {
    return [];
  }

  const bookCode = match[1];
  const chapter = match[2];
  const versePart = match[3];
  if (!bookCode || !chapter || !versePart) {
    return [];
  }

  const keys: string[] = [];
  const segments = versePart
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const rangeMatch = segment.match(/^(\d+)(?:-(\d+))?$/);
    if (!rangeMatch) {
      return [];
    }

    const start = Number.parseInt(rangeMatch[1] ?? "", 10);
    const end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0) {
      return [];
    }

    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    for (let verse = rangeStart; verse <= rangeEnd; verse += 1) {
      keys.push(`${bookCode} ${chapter}:${verse}`);
    }
  }

  return keys;
}

function getComposedVerseData(
  bibleLookup: Map<string, VerseEntry>,
  reference: string
): VerseData | null {
  const verseKeys = getSingleChapterVerseKeys(reference);
  if (verseKeys.length <= 1) {
    return null;
  }

  const verses = verseKeys.map((key) => toVerseData(bibleLookup.get(key)));
  if (verses.some((verse) => !verse)) {
    return null;
  }

  return {
    text: verses.map((verse) => verse!.text).join(" "),
    version: verses.find((verse) => verse?.version)?.version ?? BIBLE_ABBREVIATION,
  };
}

export async function getVerseData(rawReference: string): Promise<VerseData | null> {
  const normalizedReference = normalizeLookupKey(rawReference);

  if (referenceCache.has(normalizedReference)) {
    return referenceCache.get(normalizedReference)!;
  }

  const bibleLookup = await getBibleLookup();
  const verseData =
    toVerseData(bibleLookup.get(normalizedReference)) ??
    getComposedVerseData(bibleLookup, normalizedReference);
  referenceCache.set(normalizedReference, verseData);
  return verseData;
}

export async function getVerse(rawReference: string): Promise<string> {
  const verseData = await getVerseData(rawReference);
  return verseData?.text ?? "";
}
