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

export function createSearchEngine(dataset = []) {
  const documents = new Map();
  const invertedIndex = new Map();

  dataset.forEach((doc, position) => {
    const docId = doc && doc.id != null ? String(doc.id) : `${doc.slug ?? "doc"}-${position}`;
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

export function searchIndex(engine, query, options = {}) {
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

export function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
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

export { STOP_WORDS };
