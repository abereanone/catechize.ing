const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "what",
  "to",
  "was",
  "will",
  "with",
]);
const MIN_QUERY_LENGTH = 3;
const MIN_TOKEN_LENGTH = 3;
const ORDINAL_TO_WORD = {
  "1st": "first",
  "2nd": "second",
  "3rd": "third",
  "4th": "fourth",
  "5th": "fifth",
  "6th": "sixth",
  "7th": "seventh",
  "8th": "eighth",
  "9th": "ninth",
  "10th": "tenth",
};
const WORD_TO_ORDINAL = Object.fromEntries(
  Object.entries(ORDINAL_TO_WORD).map(([ordinal, word]) => [word, ordinal])
);
const ORDINAL_PATTERN = createWordBoundaryPattern(Object.keys(ORDINAL_TO_WORD));
const ORDINAL_WORD_PATTERN = createWordBoundaryPattern(Object.keys(WORD_TO_ORDINAL));

function createSearchEngine(dataset = []) {
  const documents = new Map();
  const invertedIndex = new Map();

  dataset.forEach((doc, position) => {
    const docId = getDocumentId(doc, position);
    const normalizedTitle = normalizeForSearch(doc?.title ?? "");
    const normalizedContent = normalizeForSearch(doc?.content ?? "");
    const normalizedCategories = (doc?.categories ?? []).map((category) => normalizeForSearch(category));

    const tokenWeights = new Map();
    accumulateTokens(tokenWeights, doc?.title ?? "", 3);
    accumulateTokens(tokenWeights, doc?.content ?? "", 1);
    accumulateTokens(tokenWeights, (doc?.categories ?? []).join(" "), 2);

    const tokenCount = Array.from(tokenWeights.values()).reduce((sum, value) => sum + value, 0) || 1;

    const record = {
      ...doc,
      docId,
      normalizedTitle,
      normalizedContent,
      normalizedCategories,
      tokenCount,
    };

    documents.set(docId, record);

    tokenWeights.forEach((weight, token) => {
      if (!invertedIndex.has(token)) {
        invertedIndex.set(token, []);
      }
      invertedIndex.get(token).push({ docId, weight });
    });
  });

  return { documents, invertedIndex };
}

function searchIndex(engine, query, options = {}) {
  if (!engine) {
    return { total: 0, items: [] };
  }

  const tokens = tokenize(query).filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token));
  const uniqueTokens = [...new Set(tokens)];
  const docScores = new Map();

  uniqueTokens.forEach((token) => {
    const entries = engine.invertedIndex.get(token);
    if (!entries) {
      return;
    }

    entries.forEach(({ docId, weight }) => {
      const doc = engine.documents.get(docId);
      if (!doc) {
        return;
      }

      const score = docScores.get(docId) ?? 0;
      docScores.set(docId, score + weight / doc.tokenCount);
    });
  });

  if (!docScores.size && uniqueTokens.length === 1) {
    const fallback = uniqueTokens[0];
    engine.documents.forEach((doc, docId) => {
      if (doc.normalizedTitle.includes(fallback) || doc.normalizedContent.includes(fallback)) {
        docScores.set(docId, 0.05);
      }
    });
  }

  const filters = (options.categories ?? []).map((category) => normalizeForSearch(category));
  const authorFilters = (options.authors ?? []).map((author) => String(author).toLowerCase());
  const normalizedQuery = normalizeForSearch(query);

  if (!docScores.size && !uniqueTokens.length && !normalizedQuery) {
    engine.documents.forEach((doc, docId) => {
      docScores.set(docId, 0);
    });
  }

  const ranked = Array.from(docScores.entries())
    .map(([docId, score]) => {
      const doc = engine.documents.get(docId);
      if (!doc) {
        return null;
      }

      let adjusted = score;
      if (normalizedQuery && doc.normalizedTitle.includes(normalizedQuery)) {
        adjusted += 1.5;
      } else if (normalizedQuery && doc.normalizedContent.includes(normalizedQuery)) {
        adjusted += 0.5;
      }

      if (doc.relatedAnswers?.length) {
        adjusted += Math.min(0.4, doc.relatedAnswers.length * 0.05);
      }

      return { doc, score: adjusted };
    })
    .filter(Boolean);

  const filtered = ranked.filter(({ doc }) => {
    if (filters.length && !filters.every((target) => doc.normalizedCategories.includes(target))) {
      return false;
    }

    if (authorFilters.length) {
      const docAuthors = (doc.authorIds ?? []).map((id) => String(id).toLowerCase());
      return authorFilters.every((author) => docAuthors.includes(author));
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.doc.title.localeCompare(b.doc.title);
  });

  const limit = options.limit ?? 10;
  const limited = filtered.slice(0, limit);

  const highlightTokens = filterHighlightTokens(
    uniqueTokens.length
      ? uniqueTokens
      : normalizedQuery && normalizedQuery.length >= MIN_TOKEN_LENGTH
        ? [normalizedQuery]
        : []
  );

  return {
    total: filtered.length,
    items: limited.map(({ doc, score }) => ({
      id: doc.id,
      idLabel: doc.idLabel ?? null,
      slug: doc.slug,
      title: doc.title,
      highlightedTitle: highlightText(doc.title ?? "", highlightTokens),
      categories: doc.categories,
      excerpt: doc.excerpt,
      snippet: buildSnippet(doc, highlightTokens) || doc.excerpt,
      relatedAnswers: doc.relatedAnswers,
      score: Number(score.toFixed(4)),
      url: `/questions/${doc.slug}`,
    })),
  };
}

function accumulateTokens(target, text, weightMultiplier) {
  tokenize(text).forEach((token) => {
    if (!token) {
      return;
    }
    const current = target.get(token) ?? 0;
    target.set(token, current + weightMultiplier);
  });
}

function tokenize(value) {
  return normalizeForSearch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSearch(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return normalized;
  }

  const variants = new Set([normalized]);
  const withOrdinalWords = normalized.replace(ORDINAL_PATTERN, (match) => ORDINAL_TO_WORD[match] ?? match);
  const withOrdinalNumbers = normalized.replace(
    ORDINAL_WORD_PATTERN,
    (match) => WORD_TO_ORDINAL[match] ?? match
  );

  if (withOrdinalWords !== normalized) {
    variants.add(withOrdinalWords);
  }

  if (withOrdinalNumbers !== normalized) {
    variants.add(withOrdinalNumbers);
  }

  return Array.from(variants).join(" ");
}

function createWordBoundaryPattern(values) {
  const pattern = values.map(escapeRegExp).join("|");
  return new RegExp(`\\b(?:${pattern})\\b`, "g");
}

function getDocumentId(doc, position) {
  if (doc?.slug != null && String(doc.slug).length) {
    return String(doc.slug);
  }

  if (doc?.idLabel != null && String(doc.idLabel).length) {
    return String(doc.idLabel);
  }

  if (doc?.id != null) {
    return `${doc.id}-${position}`;
  }

  return `doc-${position}`;
}

function buildSnippet(doc, tokens) {
  if (!doc.content) {
    return doc.excerpt ?? "";
  }

  if (!tokens.length) {
    return doc.excerpt ?? doc.content.slice(0, 160);
  }

  const loweredContent = doc.content.toLowerCase();
  let matchIndex = -1;
  let matchLength = 0;

  for (const token of tokens) {
    const index = loweredContent.indexOf(token.toLowerCase());
    if (index !== -1) {
      matchIndex = index;
      matchLength = token.length;
      break;
    }
  }

  if (matchIndex === -1) {
    return doc.excerpt ?? doc.content.slice(0, 160);
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(doc.content.length, matchIndex + matchLength + 80);
  let snippet = doc.content.slice(start, end).trim();

  const highlightPattern = new RegExp(tokens.map(escapeRegExp).join("|"), "gi");
  snippet = snippet.replace(highlightPattern, (match) => `<mark>${match}</mark>`);

  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < doc.content.length) {
    snippet = `${snippet}…`;
  }

  return snippet;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, tokens) {
  if (!text || !tokens.length) {
    return text ?? "";
  }

  const pattern = new RegExp(tokens.map(escapeRegExp).join("|"), "gi");
  return text.replace(pattern, (match) => `<mark>${match}</mark>`);
}

function filterHighlightTokens(tokens) {
  return tokens.filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

let initialized = false;

function initSearchPage() {
  if (initialized || typeof document === "undefined") {
    return;
  }
  initialized = true;

  const start = () => {
    const root = document.querySelector("[data-search-root]");
    if (!root) {
      return;
    }

    const showQuestionIds = root.dataset.showQuestionIds === "true";
    const form = root.querySelector("#search-form");
    const input = root.querySelector("#search-input");
    const metaContainer = root.querySelector("#search-meta");
    const resultsContainer = root.querySelector("#search-results");
    const authorFilter = root.querySelector("[data-author-filter]");
    const searchIndexUrl = root.dataset.searchIndexUrl || "/assets/search-index.json";

    if (!form || !input || !metaContainer || !resultsContainer) {
      return;
    }

    let enginePromise = null;

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") ?? "";
    let selectedAuthor = params.get("author") || "";
    const authorMapRaw = root.dataset.authorMap;
    const authorLookup = {};

    if (authorMapRaw) {
      try {
        const parsed = JSON.parse(authorMapRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (entry && typeof entry.id === "string") {
              authorLookup[entry.id] = entry.name ?? entry.id;
            }
          });
        }
      } catch (error) {
        console.warn("Unable to parse author map for search filters.", error);
      }
    }

    if (initialQuery) {
      input.value = initialQuery;
      void performSearch(initialQuery);
    }

    focusSearchInput();

    let debounceTimer = null;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      const normalized = normalizeQueryValue(query);
      updateUrlState(normalized);
      void performSearch(normalized);
    });

    input.addEventListener("input", () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        const query = input.value.trim();
        const normalized = normalizeQueryValue(query);
        updateUrlState(normalized);
        void performSearch(normalized);
      }, 300);
    });

    if (authorFilter) {
      authorFilter.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.closest("[data-author]")) {
          return;
        }
        const authorId = target.dataset.author ?? "";
        if (authorId === selectedAuthor) {
          selectedAuthor = "";
        } else {
          selectedAuthor = authorId;
        }
        updateAuthorButtons(authorFilter, selectedAuthor);
        applyUrlState(input.value.trim(), selectedAuthor);
        void performSearch(input.value.trim());
      });

      updateAuthorButtons(authorFilter, selectedAuthor);
      if (selectedAuthor && !initialQuery) {
        void performSearch("");
      }
    }

    function updateUrlState(query) {
      applyUrlState(query, selectedAuthor);
    }

    function focusSearchInput() {
      if (typeof input.focus === "function") {
        requestAnimationFrame(() => {
          input.focus({ preventScroll: true });
        });
      }
    }

    async function performSearch(query) {
      const normalizedQuery = normalizeQueryValue(query);
      const hasQuery = Boolean(normalizedQuery);
      const hasAuthor = Boolean(selectedAuthor);

      if (!hasQuery && !hasAuthor) {
        metaContainer.textContent = "Type a phrase or select an author to begin searching.";
        resultsContainer.innerHTML = "";
        return;
      }

      if (hasQuery && normalizedQuery.length < MIN_QUERY_LENGTH) {
        metaContainer.textContent = "Please enter at least 3 characters to search.";
        resultsContainer.innerHTML = "";
        return;
      }

      metaContainer.textContent = "Searching...";

      let engine;
      try {
        engine = await loadEngine();
      } catch (error) {
        console.error("Unable to load search index.", error);
        metaContainer.textContent = "Search is unavailable right now.";
        resultsContainer.innerHTML = "";
        return;
      }

      const payload = searchIndex(engine, normalizedQuery, {
        limit: 25,
        authors: selectedAuthor ? [selectedAuthor] : undefined,
      });
      const { items, total } = payload;

      const authorName = selectedAuthor ? authorLookup[selectedAuthor] ?? selectedAuthor : null;
      const filterLabel = buildFilterLabel(hasQuery ? normalizedQuery : "", authorName);

      if (!items.length) {
        metaContainer.textContent = filterLabel ? `No results found for ${filterLabel}.` : "No results found.";
        resultsContainer.innerHTML = "";
        return;
      }

      const resultCount = total === items.length ? total : `${items.length} of ${total}`;
      metaContainer.textContent = filterLabel
        ? `Showing ${resultCount} results for ${filterLabel}.`
        : `Showing ${resultCount} results.`;

      resultsContainer.innerHTML = items
        .map((result) => {
          const titleHtml = result.highlightedTitle || result.title;
          const snippetHtml = result.snippet || result.excerpt || "";
          const idLabel =
            result.idLabel ?? (result.id !== null && result.id !== undefined ? String(result.id) : null);
          const titlePrefix =
            showQuestionIds && idLabel
              ? `<span class="result-id">#${idLabel}</span> `
              : "";

          return `
            <article class="search-result">
              <h2><a href="${result.url}">${titlePrefix}${titleHtml}</a></h2>
              <p class="result-snippet">${snippetHtml}</p>
            </article>
          `;
        })
        .join("");
    }

    function loadEngine() {
      if (!enginePromise) {
        enginePromise = fetch(searchIndexUrl, { headers: { Accept: "application/json" } })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Search index request failed with ${response.status}.`);
            }
            return response.json();
          })
          .then((dataset) => createSearchEngine(Array.isArray(dataset) ? dataset : []));
      }

      return enginePromise;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

function normalizeQueryValue(value) {
  return value.trim();
}

function updateAuthorButtons(container, selected) {
  const buttons = Array.from(container.querySelectorAll("[data-author]"));
  buttons.forEach((button) => {
    const id = button.dataset.author ?? "";
    if (id === selected) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    }
  });
}

function applyUrlState(rawQuery, author) {
  const query = normalizeQueryValue(rawQuery);
  const searchParams = new URLSearchParams(window.location.search);
  if (query) {
    searchParams.set("q", query);
  } else {
    searchParams.delete("q");
  }
  if (author) {
    searchParams.set("author", author);
  } else {
    searchParams.delete("author");
  }
  const next = `${window.location.pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
  window.history.replaceState({}, "", next);
}

function buildFilterLabel(query, authorName) {
  if (query && authorName) {
    return `"${query}" and author: ${authorName}`;
  }
  if (query) {
    return `"${query}"`;
  }
  if (authorName) {
    return `author: ${authorName}`;
  }
  return "";
}

initSearchPage();
