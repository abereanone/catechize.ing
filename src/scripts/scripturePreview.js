import { getVerseData } from "@/lib/bible/bibleClient";

function formatVerseText(verse) {
  if (!verse) {
    return "Verse text could not be loaded for this reference.";
  }

  if (Array.isArray(verse.parts) && verse.parts.length > 0) {
    const partsText = verse.parts
      .map((part) => {
        const reference = String(part?.reference || "").trim();
        const text = String(part?.text || "").trim();
        const version = String(part?.version || "BSB").trim();
        if (!text) {
          return "";
        }

        return reference ? `${reference} (${version}) - ${text}` : `${text} (${version})`;
      })
      .filter(Boolean)
      .join(" ");

    if (partsText) {
      return partsText;
    }
  }

  return `${verse.text} (${verse.version})`;
}

export function initScripturePreview() {
  const verseCard = document.querySelector("[data-scripture-verse]");
  const verseBody = document.querySelector("[data-scripture-verse-body]");
  const referenceKey = verseCard?.getAttribute("data-reference-key");

  if (!verseBody || !referenceKey) {
    return;
  }

  getVerseData(referenceKey)
    .then((verse) => {
      verseBody.textContent = formatVerseText(verse);
    })
    .catch(() => {
      verseBody.textContent = "Verse text could not be loaded for this reference.";
    });
}

