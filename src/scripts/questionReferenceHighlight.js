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
    requestAnimationFrame(() => {
      scrollWithOffset(firstMatch);
    });
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

