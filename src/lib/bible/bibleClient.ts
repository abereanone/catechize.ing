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

export async function getVerseData(rawReference: string): Promise<VerseData | null> {
  const normalizedReference = normalizeLookupKey(rawReference);

  if (referenceCache.has(normalizedReference)) {
    return referenceCache.get(normalizedReference)!;
  }

  const bibleLookup = await getBibleLookup();
  const verseData = toVerseData(bibleLookup.get(normalizedReference));
  referenceCache.set(normalizedReference, verseData);
  return verseData;
}

export async function getVerse(rawReference: string): Promise<string> {
  const verseData = await getVerseData(rawReference);
  return verseData?.text ?? "";
}
