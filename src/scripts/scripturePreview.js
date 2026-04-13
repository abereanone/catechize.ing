import { getVerseData } from "@/lib/bible/bibleClient";

export function initScripturePreview() {
  const verseCard = document.querySelector("[data-scripture-verse]");
  const verseBody = document.querySelector("[data-scripture-verse-body]");
  const referenceKey = verseCard?.getAttribute("data-reference-key");

  if (!verseBody || !referenceKey) {
    return;
  }

  getVerseData(referenceKey)
    .then((verse) => {
      verseBody.textContent = verse
        ? `${verse.text} (${verse.version})`
        : "Verse text could not be loaded for this reference.";
    })
    .catch(() => {
      verseBody.textContent = "Verse text could not be loaded for this reference.";
    });
}

