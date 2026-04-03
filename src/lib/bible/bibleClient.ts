const BIBLE_ID = "eng_bsb";
const bookCache = new Map<string, any>();
const referenceCache = new Map<string, string>();

function rewriteDivineNameConventions(text: string): string {
  return text
    .replace(/\\f \+ \\fr 2:4 \\ft LORD or GOD, with capital letters.*?\\f\*/g, "")
    .replace(/\\f \+ \\fr .*? \\ft That is, the LORD\\f\*/g, "")
    .replace(/\b(the LORD GOD|GOD the LORD)\b/g, "Yah\u2014Yaweh himself\u2014")
    .replace(/\bTHE LORD\b/g, "YAHWEH")
    .replace(/(\b[Tt]he )?\bLORD\b(?! OF LORDS)/g, "Yahweh")
    .replace(/(?<!UNKNOWN )\bGOD\b/g, "Yahweh");
}

async function fetchBook(bookCode: string): Promise<any> {
  if (bookCache.has(bookCode)) {
    return bookCache.get(bookCode);
  }

  const response = await fetch(`https://v1.fetch.bible/bibles/${BIBLE_ID}/txt/${bookCode}.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch book ${bookCode}: ${response.status}`);
  }

  const data = await response.json();
  bookCache.set(bookCode, data);
  return data;
}

export async function getVerse(rawReference: string): Promise<string> {
  if (referenceCache.has(rawReference)) {
    return referenceCache.get(rawReference)!;
  }

  const [bookCode, chapterAndVerses] = rawReference.split(" ");
  if (!chapterAndVerses) {
    return "";
  }

  const [chapterPart, verseSegment] = chapterAndVerses.split(":");
  const chapterNumber = parseInt(chapterPart, 10);
  if (!verseSegment || Number.isNaN(chapterNumber)) {
    return "";
  }

  const [startRaw, endRaw] = verseSegment.split("-").map((value) => parseInt(value, 10));
  const verseStart = startRaw;
  const verseEnd =
    typeof endRaw === "number" && !Number.isNaN(endRaw) ? endRaw : startRaw;

  const data = await fetchBook(bookCode);

  const verses: string[] = [];
  for (let v = verseStart; v <= verseEnd; v += 1) {
    const chapterEntries = data.contents?.[chapterNumber];
    if (!Array.isArray(chapterEntries)) {
      console.warn(
        `[bible] Missing chapter ${chapterNumber} for ${bookCode}`,
        Object.keys(data.contents ?? {})
      );
      break;
    }

    const pieces = chapterEntries?.[v];
    if (!pieces) {
      console.warn(`[bible] Missing verse ${bookCode} ${chapterNumber}:${v}`);
      continue;
    }

    const verseText = rewriteDivineNameConventions(
      (Array.isArray(pieces) ? pieces : [pieces])
      .map((piece) => {
        if (typeof piece === "string") {
          return piece;
        }
        if (piece && typeof piece === "object") {
          if ("type" in piece && ((piece as { type?: string }).type === "note" || (piece as { type?: string }).type === "heading")) {
            return "";
          }
          if ("contents" in piece && typeof (piece as { contents?: string }).contents === "string") {
            return (piece as { contents: string }).contents;
          }
        }
        return "";
      })
      .join("")
      .trim()
    );

    if (verseText) {
      verses.push(`${v} ${verseText}`);
    }
  }

  const combined = verses.join(" ");
  referenceCache.set(rawReference, combined);
  return combined;
}
