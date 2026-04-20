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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function toBookPattern(book: string): string {
  let pattern = escapeRegex(book).replace(/\s+/g, "\\s+");

  pattern = pattern
    .replace(/^1(?=\\s\+)/, "(?:1|i)")
    .replace(/^2(?=\\s\+)/, "(?:2|ii)")
    .replace(/^3(?=\\s\+)/, "(?:3|iii)")
    .replace(/^1(?=[a-z])/, "(?:1|i)")
    .replace(/^2(?=[a-z])/, "(?:2|ii)")
    .replace(/^3(?=[a-z])/, "(?:3|iii)");

  if (/[a-z]$/i.test(book)) {
    pattern += "\\.?";
  }

  return pattern;
}

const bookPattern = Object.keys(bookMap)
  .sort((a, b) => b.length - a.length)
  .map((book) => toBookPattern(book))
  .join("|");

const singleChapterBookPattern = [...singleChapterBooks]
  .sort((a, b) => b.length - a.length)
  .map((book) => toBookPattern(book))
  .join("|");

const multiVerseSingleChapterRegex = new RegExp(
  `\\b(${singleChapterBookPattern})\\s+(\\d+(?:[-\\u2013\\u2014]\\d+)?)(?:\\s*,\\s*\\d+(?:[-\\u2013\\u2014]\\d+)?)+`,
  "gi"
);
const multiVerseRegex = new RegExp(
  `\\b(${bookPattern})\\s+(\\d+):(\\d+(?:[-\\u2013\\u2014]\\d+)?)(?:\\s*,\\s*\\d+(?::\\d+(?:[-\\u2013\\u2014]\\d+)?)?(?:[-\\u2013\\u2014]\\d+)?)+`,
  "gi"
);
const singleVerseSingleChapterRegex = new RegExp(
  `\\b(${singleChapterBookPattern})\\s+(\\d+(?:[-\\u2013\\u2014]\\d+)?)\\b`,
  "gi"
);
const singleVerseRegex = new RegExp(
  `\\b(${bookPattern})\\s+(\\d+):(\\d+(?:[-\\u2013\\u2014]\\d+)?)\\b`,
  "gi"
);
const chapterOnlyRegex = new RegExp(`\\b(${bookPattern})\\s+(\\d+)\\b(?!\\s*:)`, "gi");
const continuedVerseRegex = /([;]\s*)(\d+:\d+(?:[-\u2013\u2014]\d+)?)(?=(?:\s*[;),.]|\s*$))/g;

export function autoLinkBibleRefs(html: string): string {
  const withChapterOnly = html.replace(chapterOnlyRegex, (match, book: string, chapter: string) => {
    const normalizedBook = normalizeBookKey(String(book));
    if (singleChapterBooks.has(normalizedBook)) {
      return match;
    }

    const ref = `${book} ${chapter}`;
    return `<span class="bible-ref" data-ref="${ref}">${match}</span>`;
  });

  const placeholders: string[] = [];
  const withSingleChapterMulti = withChapterOnly.replace(
    multiVerseSingleChapterRegex,
    (match, book: string, firstVerse: string) => {
      const firstRef = `${book} ${firstVerse}`;
      let output = `<span class="bible-ref" data-ref="${firstRef}">${book} ${firstVerse}</span>`;

      const rest = match.slice(`${book} ${firstVerse}`.length);
      const extraMatches = rest.match(/,\s*\d+(?:[-\u2013\u2014]\d+)?/g) ?? [];

      extraMatches.forEach((chunk) => {
        const verse = chunk.replace(/,\s*/, "");
        const ref = `${book} ${verse}`;
        output += `${chunk.replace(verse, "")}<span class="bible-ref" data-ref="${ref}">${verse}</span>`;
      });

      const token = `__BIBLE_MULTI__${placeholders.length}__`;
      placeholders.push(output);
      return token;
    }
  );

  const withMulti = withSingleChapterMulti.replace(
    multiVerseRegex,
    (match, book: string, chapter: string, firstVerse: string) => {
      const baseRef = `${book} ${chapter}`;
      const firstRef = `${baseRef}:${firstVerse}`;
      let output = `<span class="bible-ref" data-ref="${firstRef}">${book} ${chapter}:${firstVerse}</span>`;

      const rest = match.slice(`${book} ${chapter}:${firstVerse}`.length);
      const extraMatches = rest.match(
        /,\s*\d+(?::\d+(?:[-\u2013\u2014]\d+)?)?(?:[-\u2013\u2014]\d+)?/g
      ) ?? [];

      extraMatches.forEach((chunk) => {
        const verse = chunk.replace(/,\s*/, "");
        const ref = verse.includes(":") ? `${book} ${verse}` : `${baseRef}:${verse}`;
        output += `${chunk.replace(verse, "")}<span class="bible-ref" data-ref="${ref}">${verse}</span>`;
      });

      const token = `__BIBLE_MULTI__${placeholders.length}__`;
      placeholders.push(output);
      return token;
    }
  );

  const withSingleChapterSingles = withMulti.replace(
    singleVerseSingleChapterRegex,
    (match, book: string, verse: string) => {
      const ref = `${book} ${verse}`;
      return `<span class="bible-ref" data-ref="${ref}">${match}</span>`;
    }
  );

  const withSingles = withSingleChapterSingles.replace(
    singleVerseRegex,
    (match, book: string, chapter: string, verse: string) => {
      const ref = `${book} ${chapter}:${verse}`;
      return `<span class="bible-ref" data-ref="${ref}">${match}</span>`;
    }
  );

  const withContinuedVerses = withSingles.replace(
    /((?:<span class="bible-ref" data-ref="([^"]+)">[^<]+<\/span>)(?:[^<]|<(?!span class="bible-ref"))*)/g,
    (segment) => {
      let lastBook: string | null = null;

      const seedMatch = segment.match(/data-ref="([^"]+)"/);
      if (seedMatch) {
        const ref = seedMatch[1] ?? "";
        const bookMatch = ref.match(/^(.+?)\s+\d+:\d+/);
        lastBook = bookMatch?.[1] ?? null;
      }

      return segment.replace(continuedVerseRegex, (match, separator: string, chapterVerse: string) => {
        if (!lastBook) {
          return match;
        }

        const ref = `${lastBook} ${chapterVerse}`;
        return `${separator}<span class="bible-ref" data-ref="${ref}">${chapterVerse}</span>`;
      });
    }
  );

  return withContinuedVerses.replace(/__BIBLE_MULTI__(\d+)__/g, (match, index) => {
    const idx = Number(index);
    return Number.isNaN(idx) ? match : placeholders[idx] ?? match;
  });
}
