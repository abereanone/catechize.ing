import bookMap from "./bookMap.json";

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

function normalizeLeadingRomanNumeral(value: string): string {
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

function normalizeBookKey(book: string): string {
  return normalizeLeadingRomanNumeral(book)
    .replace(/\./g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBookName(book: string): string | undefined {
  const normalizedKey = normalizeBookKey(book);
  return (
    bookMap[normalizedKey] ??
    bookMap[normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1)]
  );
}

function splitReferenceParts(reference: string): { book: string; chapterAndVerse: string } | null {
  const match = reference.match(
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

export function normalizeReference(reference: string): string {
  const lower = reference.trim().toLowerCase().replace(/\u2013|\u2014/g, "-");
  const parts = splitReferenceParts(lower);
  if (!parts) {
    return reference;
  }

  const { book } = parts;
  const normalizedBookKey = normalizeBookKey(book);
  let chapterAndVerse = parts.chapterAndVerse;

  if (!chapterAndVerse.includes(":") && singleChapterBooks.has(normalizedBookKey)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  const normalizedBook = normalizeBookName(book);
  if (!normalizedBook) {
    return reference;
  }

  if (!chapterAndVerse.includes(":") && singleChapterBooks.has(normalizedBook)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  return `${normalizedBook} ${chapterAndVerse}`;
}
