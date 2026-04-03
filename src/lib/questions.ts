import categoriesData from "@/data/categories.json";
import authorsData from "@/data/resources.json";
import generatedQuestionsData from "@/generated/questions.json";

export interface Question {
  id: number | null;
  slug: string;
  title: string;
  categories: string[];
  authorId: string | null;
  published: boolean;
  longAuthorId: string | null;
  suppressAuthor: boolean;
  relatedAnswers: string[];
  excerpt: string;
  answerHtml: string;
  longHtml: string;
  groupCodes: string[];
}

type Category = (typeof categoriesData)[number];
type Author = (typeof authorsData)[number];

type CategorySummary = {
  id: string;
  name: string;
  count: number;
  sortOrder?: number;
  groupCode?: string;
};

type AuthorSummary = {
  id: string;
  name: string;
  count: number;
  url?: string;
  bio?: string;
  sortOrder?: number;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeQuestion(entry: Partial<Question>): Question {
  return {
    id: typeof entry.id === "number" ? entry.id : null,
    slug: String(entry.slug ?? ""),
    title: String(entry.title ?? ""),
    categories: Array.isArray(entry.categories) ? entry.categories.map((value) => String(value)) : [],
    authorId: entry.authorId ? String(entry.authorId) : null,
    published: entry.published !== false,
    longAuthorId: entry.longAuthorId ? String(entry.longAuthorId) : null,
    suppressAuthor: entry.suppressAuthor === true,
    relatedAnswers: Array.isArray(entry.relatedAnswers)
      ? entry.relatedAnswers.map((value) => String(value))
      : [],
    excerpt: String(entry.excerpt ?? ""),
    answerHtml: String(entry.answerHtml ?? ""),
    longHtml: String(entry.longHtml ?? ""),
    groupCodes: Array.isArray(entry.groupCodes) ? entry.groupCodes.map((value) => String(value)) : [],
  };
}

function sortQuestions(list: Question[]): Question[] {
  return [...list].sort((a, b) => {
    const orderA = typeof a.id === "number" ? a.id : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.id === "number" ? b.id : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.title.localeCompare(b.title);
  });
}

const questionsData: Question[] = sortQuestions(
  (Array.isArray(generatedQuestionsData) ? generatedQuestionsData : []).map((entry) =>
    normalizeQuestion(entry as Partial<Question>)
  )
);

const publishedQuestions = questionsData.filter((question) => question.published);

const questionMap = new Map<string, Question>();
const questionIdMap = new Map<number, Question[]>();
const groupKeyMap = new Map<string, Question>();

questionsData.forEach((question) => {
  questionMap.set(question.slug, question);

  if (typeof question.id === "number") {
    const list = questionIdMap.get(question.id) ?? [];
    list.push(question);
    questionIdMap.set(question.id, list);

    question.groupCodes.forEach((code) => {
      groupKeyMap.set(`${String(code).toUpperCase()}${question.id}`, question);
    });
  }
});

function buildCategoryConfigMap() {
  const map = new Map<string, Category & { canonicalSlug: string }>();

  categoriesData.forEach((category) => {
    const canonicalSlug = slugify(category.id);
    const entry = { ...category, canonicalSlug };
    map.set(canonicalSlug, entry);

    if (category.name) {
      const nameSlug = slugify(category.name);
      map.set(nameSlug, entry);
    }
  });

  return map;
}

const categoryConfigMap = buildCategoryConfigMap();

function buildCategoryMap(): Map<string, CategorySummary> {
  const map = new Map<string, CategorySummary>();

  categoriesData.forEach((category) => {
    const canonicalSlug = slugify(category.id);
    map.set(canonicalSlug, {
      id: canonicalSlug,
      name: category.name,
      count: 0,
      sortOrder: typeof category.sortOrder === "number" ? category.sortOrder : undefined,
      groupCode: category.groupCode ? String(category.groupCode).toUpperCase() : undefined,
    });
  });

  publishedQuestions.forEach((question) => {
    const seen = new Set<string>();

    question.categories.forEach((label) => {
      const slug = slugify(label);
      const config = categoryConfigMap.get(slug);
      const canonicalSlug = config?.canonicalSlug ?? slug;
      const entry =
        map.get(canonicalSlug) ??
        (() => {
          const fallback = { id: canonicalSlug, name: config?.name ?? label, count: 0 };
          map.set(canonicalSlug, fallback);
          return fallback;
        })();

      if (!seen.has(canonicalSlug)) {
        entry.count += 1;
        seen.add(canonicalSlug);
      }
    });
  });

  return map;
}

function buildAuthorMap(): Map<string, AuthorSummary> {
  const map = new Map<string, AuthorSummary>();

  authorsData.forEach((author: Author) => {
    const slug = slugify(author.id || author.name);
    map.set(slug, {
      id: slug,
      name: author.name,
      count: 0,
      url: author.url,
      bio: author.bio,
      sortOrder: typeof author.sortOrder === "number" ? author.sortOrder : undefined,
    });
  });

  publishedQuestions.forEach((question) => {
    if (!question.authorId) {
      return;
    }

    const slug = slugify(question.authorId);
    const entry =
      map.get(slug) ??
      (() => {
        const fallback = { id: slug, name: question.authorId!, count: 0 };
        map.set(slug, fallback);
        return fallback;
      })();

    entry.count += 1;
  });

  return map;
}

const categoryMap = buildCategoryMap();
const categoryList = Array.from(categoryMap.values()).sort((a, b) => {
  const orderA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.name.localeCompare(b.name);
});

const authorMap = buildAuthorMap();
const authorList = Array.from(authorMap.values()).sort((a, b) => {
  const orderA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.name.localeCompare(b.name);
});

export function getPublishedQuestions(categoryId?: string): Question[] {
  if (!categoryId) {
    return publishedQuestions;
  }

  const slug = slugify(categoryId);
  const canonicalSlug = categoryConfigMap.get(slug)?.canonicalSlug ?? slug;
  return publishedQuestions.filter((question) =>
    question.categories.some((label) => {
      const labelSlug = slugify(label);
      const labelCanonical = categoryConfigMap.get(labelSlug)?.canonicalSlug ?? labelSlug;
      return labelCanonical === canonicalSlug;
    })
  );
}

export function getQuestionsByAuthor(authorId: string): Question[] {
  const slug = slugify(authorId);

  return publishedQuestions.filter(
    (question) => Boolean(question.authorId) && slugify(question.authorId!) === slug
  );
}

export function listCategories(): CategorySummary[] {
  return categoryList;
}

export function findCategory(categoryId: string): CategorySummary | null {
  const slug = slugify(categoryId);
  const canonicalSlug = categoryConfigMap.get(slug)?.canonicalSlug ?? slug;
  return categoryMap.get(canonicalSlug) ?? null;
}

export function listAuthors(): AuthorSummary[] {
  return authorList;
}

export function findAuthor(authorId: string): AuthorSummary | null {
  return authorMap.get(slugify(authorId)) ?? null;
}

export function findQuestion(slug: string): Question | null {
  return questionMap.get(slug) ?? null;
}

export function getRelatedQuestions(question: Question): Question[] {
  const related = [];
  const seen = new Set<string>();

  question.relatedAnswers.forEach((slug) => {
    if (!slug || seen.has(slug) || slug === question.slug) {
      return;
    }

    const entry = questionMap.get(slug);
    if (!entry || !entry.published) {
      return;
    }

    seen.add(slug);
    related.push(entry);
  });

  return related;
}

export function getQuestionCategories(question: Question) {
  const seen = new Set<string>();
  const result: Array<{ id: string; name: string; groupCode?: string }> = [];

  question.categories.forEach((label) => {
    const slug = slugify(label);
    const config = categoryConfigMap.get(slug);
    const canonicalSlug = config?.canonicalSlug ?? slug;
    const entry =
      categoryMap.get(canonicalSlug) ??
      ({
        id: canonicalSlug,
        name: config?.name ?? label,
        groupCode: config?.groupCode ? String(config.groupCode).toUpperCase() : undefined,
      } as CategorySummary);

    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      result.push({
        id: entry.id,
        name: entry.name,
        groupCode: entry.groupCode,
      });
    }
  });

  return result;
}

export function getQuestionAuthor(question: Question): AuthorSummary | null {
  if (!question.authorId) {
    return null;
  }

  return authorMap.get(slugify(question.authorId)) ?? null;
}

export interface PaginatedResult<T> {
  items: T[];
  currentPage: number;
  pageCount: number;
  perPage: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
  startIndex: number;
  endIndex: number;
}

export function paginateQuestions(
  list: Question[],
  page: number,
  perPage: number
): PaginatedResult<Question> {
  const safePerPage = Math.max(1, perPage);
  const totalItems = list.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / safePerPage));
  const safePage = Math.min(Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1), pageCount);
  const start = (safePage - 1) * safePerPage;
  const end = start + safePerPage;

  const items = list.slice(start, end);
  const endIndex = Math.min(totalItems, start + items.length);

  return {
    items,
    currentPage: safePage,
    pageCount,
    perPage: safePerPage,
    totalItems,
    hasNext: safePage < pageCount,
    hasPrev: safePage > 1,
    startIndex: start,
    endIndex,
  };
}

export function findQuestionByGroupKey(key: string): Question | null {
  if (!key) {
    return null;
  }

  return groupKeyMap.get(String(key).toUpperCase()) ?? null;
}

export function getQuestionsByNumericId(id: number): Question[] {
  if (typeof id !== "number" || Number.isNaN(id)) {
    return [];
  }

  return questionIdMap.get(id) ?? [];
}

export function formatQuestionIdentifier(
  question: Question,
  options: { groupCode?: string | null; fallback?: number | null } = {}
): string | null {
  const numericId = typeof question.id === "number" ? question.id : null;

  if (options.groupCode && numericId !== null && question.groupCodes.includes(options.groupCode)) {
    return `${options.groupCode}${numericId}`;
  }

  if (numericId !== null) {
    return String(numericId);
  }

  if (typeof options.fallback === "number") {
    return String(options.fallback);
  }

  return null;
}
