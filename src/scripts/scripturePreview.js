import { BIBLE_ABBREVIATION, getVerse } from "@/lib/bible/bibleClient";

export function initScripturePreview() {
  const verseCard = document.querySelector("[data-scripture-verse]");
  const verseBody = document.querySelector("[data-scripture-verse-body]");
  const referenceKey = verseCard?.getAttribute("data-reference-key");

  if (!verseBody || !referenceKey) {
    return;
  }

  getVerse(referenceKey)
    .then((text) => {
      verseBody.textContent = text
        ? `${text} (${BIBLE_ABBREVIATION})`
        : "Verse text could not be loaded for this reference.";
    })
    .catch(() => {
      verseBody.textContent = "Verse text could not be loaded for this reference.";
    });
}

