import bookMap from "./bookMap.json";

const singleChapterBooks = new Set([
  "obadiah",
  "oba",
  "philemon",
  "phm",
  "2jn",
  "3jn",
  "jude",
  "jud",
]);

function normalizeBookName(book: string): string | undefined {
  const cleaned = book.replace(/\./g, "");
  return (
    bookMap[book] ??
    bookMap[book.charAt(0).toUpperCase() + book.slice(1)] ??
    bookMap[cleaned] ??
    bookMap[cleaned.charAt(0).toUpperCase() + cleaned.slice(1)]
  );
}

export function normalizeReference(reference: string): string {
  const lower = reference.trim().toLowerCase().replace(/\u2013|\u2014/g, "-");
  const parts = lower.split(/\s+/);

  if (parts.length < 2) {
    return reference;
  }

  const book = parts.slice(0, -1).join(" ");
  let chapterAndVerse = parts[parts.length - 1];

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(book)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  const normalizedBook = normalizeBookName(book);
  if (!normalizedBook) {
    return reference;
  }

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(normalizedBook)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  return `${normalizedBook} ${chapterAndVerse}`;
}
