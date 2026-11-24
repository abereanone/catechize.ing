import { autoLinkBibleRefs } from "@/lib/bible/autoLinkBibleRefs";
import { normalizeReference } from "@/lib/bible/normalizeRef";
import { getVerseData } from "@/lib/bible/bibleClient";
import { setVerseText } from "@/lib/bible/pluralYou.js";

const verseCache = new Map();

function formatVerseText(reference, verse) {
  const displayReference = String(reference || "").trim();

  if (!verse) {
    return displayReference ? `${displayReference} - Verse not found.` : "Verse not found.";
  }

  if (Array.isArray(verse.parts) && verse.parts.length > 0) {
    const partsText = verse.parts
      .map((part) => {
        const partReference = String(part?.reference || "").trim();
        const text = String(part?.text || "").trim();
        const version = String(part?.version || "BSB").trim();
        if (!text) {
          return "";
        }

        return partReference ? `${partReference} (${version}) - ${text}` : `${text} (${version})`;
      })
      .filter(Boolean)
      .join(" ");

    if (partsText) {
      return displayReference ? `${displayReference} - ${partsText}` : partsText;
    }
  }

  const verseText = `${verse.text} (${verse.version})`;
  return displayReference ? `${displayReference} - ${verseText}` : verseText;
}

function ensureTooltip(element) {
  if (element.__tooltipElement) {
    const tooltip = element.__tooltipElement;
    positionTooltip(element, tooltip);
    tooltip.style.display = element.__tooltipActive ? "block" : "none";
    return Promise.resolve(tooltip);
  }

  const normalized = normalizeReference(element.dataset.ref);

  return Promise.resolve()
    .then(async () => {
      let verse = verseCache.get(normalized);
      if (verse === undefined) {
        verse = await getVerseData(normalized);
        verseCache.set(normalized, verse);
      }

      const tooltip = document.createElement("div");
      tooltip.className = "bible-tooltip";
      setVerseText(tooltip, formatVerseText(element.dataset.ref, verse));
      document.body.appendChild(tooltip);

      element.__tooltipElement = tooltip;
      positionTooltip(element, tooltip);
      tooltip.style.display = element.__tooltipActive ? "block" : "none";
      return tooltip;
    })
    .catch((error) => {
      console.error("Unable to load verse text:", error);
      return undefined;
    });
}

function positionTooltip(anchor, tooltip) {
  const rect = anchor.getBoundingClientRect();

  tooltip.style.visibility = "hidden";
  tooltip.style.display = "block";

  const tooltipWidth = tooltip.offsetWidth;
  const viewportWidth = window.innerWidth;
  let left = rect.left + window.scrollX;

  if (left + tooltipWidth > viewportWidth - 16) {
    left = viewportWidth - tooltipWidth - 16;
  }
  if (left < 16) {
    left = 16;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;

  tooltip.style.display = "none";
  tooltip.style.visibility = "visible";
}

function hideTooltip(element) {
  if (element.__tooltipElement) {
    element.__tooltipElement.style.display = "none";
  }
}

// Mouse, keyboard and touch, the same way heritagerestored.org does it: a reference opens on hover or
// focus and pins open on click/tap, Enter or Space; a second tap, a tap anywhere else, or Escape closes it.
// A touch skips the hover/focus opening: when a hover handler changes the page, iPhones treat the tap as a
// hover and send no click, so the verse would open unpinned and never close.
let pinnedRef = null;
let shownRef = null;
let lastTouch = 0;
const touchedRecently = () => Date.now() - lastTouch < 1000;

function showRef(element) {
  if (shownRef && shownRef !== element) {
    hideRef(shownRef);
  }
  shownRef = element;
  element.__tooltipActive = true;
  element.setAttribute("aria-expanded", "true");
  element.dataset.bibleTooltipState = "pending";
  ensureTooltip(element).finally(() => {
    element.dataset.bibleTooltipState = "ready";
  });
}

function hideRef(element) {
  element.__tooltipActive = false;
  element.setAttribute("aria-expanded", "false");
  hideTooltip(element);
  if (pinnedRef === element) {
    pinnedRef = null;
  }
  if (shownRef === element) {
    shownRef = null;
  }
}

function enhanceElement(element) {
  if (element.dataset.bibleRefReady === "true") {
    return;
  }
  element.dataset.bibleRefReady = "true";
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-expanded", "false");

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") lastTouch = Date.now();
  });
  element.addEventListener("mouseenter", () => {
    if (!pinnedRef && !touchedRecently()) showRef(element);
  });
  element.addEventListener("mouseleave", () => {
    if (pinnedRef !== element) hideRef(element);
  });
  element.addEventListener("focus", () => {
    if (!touchedRecently()) showRef(element);
  });
  element.addEventListener("blur", () => {
    if (pinnedRef !== element) hideRef(element);
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (pinnedRef === element) {
      hideRef(element);
    } else {
      showRef(element);
      pinnedRef = element;
    }
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      element.click();
    } else if (event.key === "Escape") {
      hideRef(element);
      element.blur();
    }
  });

  element.dataset.bibleTooltipState = "ready";
}

function processScope(scope) {
  if (scope.dataset.bibleProcessed !== "true") {
    scope.innerHTML = autoLinkBibleRefs(scope.innerHTML);
    scope.dataset.bibleProcessed = "true";
  }

  scope.querySelectorAll(".bible-ref").forEach((el) => {
    enhanceElement(el);
  });
}

function scan() {
  document.querySelectorAll("[data-bible-autolink]").forEach((scope) => processScope(scope));
}

export function initBibleReferences() {
  if (window.__bibleReferencesInitialized) {
    return;
  }

  window.__bibleReferencesInitialized = true;
  document.addEventListener("astro:page-load", scan);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shownRef) hideRef(shownRef);
  });
  // pointerdown rather than click: iPhones send no click for a tap on plain text, so a document-level
  // click listener would never hear the tap that should close the verse.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!shownRef) return;
      const tip = shownRef.__tooltipElement;
      // A tap on the verse box closes it too (on a phone the box covers the text right below the
      // reference, so that is where "tapping off" lands); only a link inside the box is left to work.
      if (shownRef.contains(event.target)) return;
      if (tip && tip.contains(event.target) && event.target.closest && event.target.closest("a"))
        return;
      hideRef(shownRef);
    },
    true
  );
  document.addEventListener("astro:before-swap", () => {
    if (shownRef) hideRef(shownRef);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
}
