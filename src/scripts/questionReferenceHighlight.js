import { normalizeReference } from "@/lib/bible/normalizeRef";

const SCROLL_GAP = 24;

function getHeaderOffset() {
  const header = document.querySelector(".navbar");
  if (!(header instanceof HTMLElement)) {
    return 0;
  }

  return header.offsetHeight;
}

function scrollWithOffset(target) {
  const targetTop = window.scrollY + target.getBoundingClientRect().top - getHeaderOffset() - SCROLL_GAP;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: "smooth",
  });
}

function getScrollTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return target;
  }

  const expositionCard = target.closest(".exposition-item");
  if (expositionCard instanceof HTMLElement) {
    return expositionCard;
  }

  return target;
}

function revealLongExplanation(target) {
  const section = target.closest("[data-long-explanation]");
  const content = target.closest("[data-long-content]");
  const button = section?.querySelector("[data-long-toggle]");

  if (!section || !content || !button || !content.hidden) {
    return false;
  }

  content.hidden = false;
  button.setAttribute("aria-expanded", "true");
  button.textContent = button.getAttribute("data-hide-label") || "Hide details";
  return true;
}

function revealHiddenAnswer(target) {
  const section = target.closest("[data-answer-toggle]");
  const content = target.closest("[data-answer-content]");
  const button = section?.querySelector("[data-answer-toggle-button]");

  if (!section || !content || !button || !content.hidden) {
    return false;
  }

  content.hidden = false;
  button.setAttribute("aria-expanded", "true");
  button.hidden = true;
  return true;
}

function applyHighlight() {
  const params = new URLSearchParams(window.location.search);
  const rawReference = params.get("ref");
  if (!rawReference) {
    return;
  }

  const targetReference = normalizeReference(rawReference);
  const refs = [...document.querySelectorAll(".bible-ref")];
  let firstMatch = null;

  refs.forEach((element) => {
    element.classList.remove("is-linked-reference");
    const ref = element.getAttribute("data-ref");
    if (!ref) {
      return;
    }

    if (normalizeReference(ref) === targetReference) {
      element.classList.add("is-linked-reference");
      if (!firstMatch) {
        firstMatch = element;
      }
    }
  });

  if (firstMatch) {
    const revealedLong = revealLongExplanation(firstMatch);
    const revealedAnswer = revealHiddenAnswer(firstMatch);
    const needsDelay = revealedLong || revealedAnswer;
    const scrollTarget = getScrollTarget(firstMatch);

    window.setTimeout(() => {
      scrollWithOffset(scrollTarget);
    }, needsDelay ? 80 : 0);
  }
}

export function initQuestionReferenceHighlight() {
  const run = () => {
    window.setTimeout(applyHighlight, 0);
  };

  document.addEventListener("astro:page-load", run);
  window.addEventListener("load", run, { once: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
