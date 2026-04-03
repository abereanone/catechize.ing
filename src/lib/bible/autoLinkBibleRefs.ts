import bookMap from "./bookMap.json";

const bookPattern = Object.keys(bookMap)
  .sort((a, b) => b.length - a.length)
  .map((book) => book.replace(/\./g, "\\."))
  .join("|");

const multiVerseRegex = new RegExp(
  `\\b(${bookPattern})\\s+(\\d+):(\\d+(?:[-\\u2013\\u2014]\\d+)?)(?:\\s*,\\s*\\d+(?:[-\\u2013\\u2014]\\d+)?)+`,
  "gi"
);
const singleVerseRegex = new RegExp(
  `\\b(${bookPattern})\\s+(\\d+):(\\d+(?:[-\\u2013\\u2014]\\d+)?)\\b`,
  "gi"
);
const continuedVerseRegex = /([;]\s*)(\d+:\d+(?:[-\u2013\u2014]\d+)?)(?=(?:\s*[;),.]|\s*$))/g;

export function autoLinkBibleRefs(html: string): string {
  const placeholders: string[] = [];
  const withMulti = html.replace(
    multiVerseRegex,
    (match, book: string, chapter: string, firstVerse: string) => {
      const baseRef = `${book} ${chapter}`;
      const firstRef = `${baseRef}:${firstVerse}`;
      let output = `<span class="bible-ref" data-ref="${firstRef}">${book} ${chapter}:${firstVerse}</span>`;

      const rest = match.slice(`${book} ${chapter}:${firstVerse}`.length);
      const extraMatches = rest.match(/,\s*\d+(?:[-\u2013\u2014]\d+)?/g) ?? [];

      extraMatches.forEach((chunk) => {
        const verse = chunk.replace(/,\s*/, "");
        const ref = `${baseRef}:${verse}`;
        output += `${chunk.replace(verse, "")}<span class="bible-ref" data-ref="${ref}">${verse}</span>`;
      });

      const token = `__BIBLE_MULTI__${placeholders.length}__`;
      placeholders.push(output);
      return token;
    }
  );

  const withSingles = withMulti.replace(singleVerseRegex, (match, book: string, chapter: string, verse: string) => {
    const ref = `${book} ${chapter}:${verse}`;
    return `<span class="bible-ref" data-ref="${ref}">${match}</span>`;
  });

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
