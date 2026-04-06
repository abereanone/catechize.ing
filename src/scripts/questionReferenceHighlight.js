import { normalizeReference } from "@/lib/bible/normalizeRef";

function scrollWithOffset(target) {
  const header = document.querySelector(".navbar");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const targetTop = window.scrollY + target.getBoundingClientRect().top - headerHeight - 20;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: "smooth",
  });
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

    window.setTimeout(() => {
      scrollWithOffset(firstMatch);
    }, needsDelay ? 80 : 0);
  }
}

export function initQuestionReferenceHighlight() {
  const run = () => {
    window.setTimeout(applyHighlight, 0);
  };

  document.addEventListener("astro:page-load", run);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
