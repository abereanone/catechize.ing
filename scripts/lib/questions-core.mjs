import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml, dump as dumpYaml } from "js-yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

import { QUESTION_LONG_ANSWER_MARKER, questionFrontmatterSchema } from "../../src/lib/question-schema.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(currentDir, "..", "..");
export const QUESTION_CONTENT_DIR = path.join(ROOT_DIR, "src", "content", "questions");
export const CATEGORY_CONFIG_FILE = path.join(ROOT_DIR, "src", "data", "categories.json");
export const GENERATED_QUESTIONS_FILE = path.join(ROOT_DIR, "src", "generated", "questions.json");
export const SEARCH_INDEX_FILE = path.join(ROOT_DIR, "public", "assets", "search-index.json");

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify, { allowDangerousHtml: true });

export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitQuestionBody(body = "", sourceLabel = "question") {
  const normalized = normalizeNewlines(body).trim();
  const firstMarkerIndex = normalized.indexOf(QUESTION_LONG_ANSWER_MARKER);

  if (firstMarkerIndex === -1) {
    return {
      answerMarkdown: normalized,
      longMarkdown: "",
    };
  }

  const secondMarkerIndex = normalized.indexOf(
    QUESTION_LONG_ANSWER_MARKER,
    firstMarkerIndex + QUESTION_LONG_ANSWER_MARKER.length
  );

  if (secondMarkerIndex !== -1) {
    throw new Error(`${sourceLabel} contains multiple ${QUESTION_LONG_ANSWER_MARKER} markers.`);
  }

  const answerMarkdown = normalized.slice(0, firstMarkerIndex).trim();
  const longMarkdown = normalized.slice(firstMarkerIndex + QUESTION_LONG_ANSWER_MARKER.length).trim();

  return {
    answerMarkdown,
    longMarkdown,
  };
}

export function serializeQuestionFrontmatter(frontmatter) {
  const data = {};

  if (typeof frontmatter.id === "number") {
    data.id = frontmatter.id;
  }

  data.title = String(frontmatter.title);

  if (frontmatter.slug) {
    data.slug = String(frontmatter.slug);
  }

  data.categories = Array.isArray(frontmatter.categories) ? [...frontmatter.categories] : [];

  if (frontmatter.authorId) {
    data.authorId = String(frontmatter.authorId);
  }

  if (frontmatter.published === false) {
    data.published = false;
  }

  if (frontmatter.longAuthorId) {
    data.longAuthorId = String(frontmatter.longAuthorId);
  }

  if (frontmatter.suppressAuthor === true) {
    data.suppressAuthor = true;
  }

  if (Array.isArray(frontmatter.relatedAnswers) && frontmatter.relatedAnswers.length) {
    data.relatedAnswers = [...frontmatter.relatedAnswers];
  }

  const yaml = dumpYaml(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();

  return `---\n${yaml}\n---`;
}

export async function loadQuestionDocuments() {
  const categories = await loadCategoryConfig();
  const files = (await fs.readdir(QUESTION_CONTENT_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const documents = [];

  for (const fileName of files) {
    const sourcePath = path.join(QUESTION_CONTENT_DIR, fileName);
    const raw = await fs.readFile(sourcePath, "utf-8");
    const { frontmatter, body } = parseQuestionMarkdown(raw, fileName);
    const parsedFrontmatter = questionFrontmatterSchema.parse(frontmatter);
    const { answerMarkdown, longMarkdown } = splitQuestionBody(body, fileName);
    const slug = parsedFrontmatter.slug || slugify(path.basename(fileName, ".md"));
    const groupCodes = deriveGroupCodes(parsedFrontmatter.categories, categories);
    const combinedMarkdown = [answerMarkdown, longMarkdown].filter(Boolean).join("\n\n");
    const cleanedAnswer = cleanMarkdown(answerMarkdown);
    const cleanedCombined = cleanMarkdown(combinedMarkdown);

    documents.push({
      sourcePath,
      fileName,
      slug,
      frontmatter: parsedFrontmatter,
      answerMarkdown,
      longMarkdown,
      cleanedAnswer,
      cleanedCombined,
      excerpt: buildExcerpt(cleanedAnswer),
      groupCodes,
    });
  }

  return { documents, categories };
}

export function detectNextQuestionId(documents) {
  return (
    documents.reduce((max, document) => {
      const value = typeof document.frontmatter.id === "number" ? document.frontmatter.id : 0;
      return Math.max(max, value);
    }, 0) + 1
  );
}

export function detectFirstAvailableQuestionId(documents) {
  const usedIds = new Set(
    documents
      .map((document) => document.frontmatter.id)
      .filter((value) => typeof value === "number" && Number.isInteger(value) && value > 0)
  );

  let candidate = 1;
  while (usedIds.has(candidate)) {
    candidate += 1;
  }

  return candidate;
}

export async function buildQuestionArtifacts() {
  const { documents, categories } = await loadQuestionDocuments();
  validateQuestionDocuments(documents);

  const questions = [];
  const searchDocuments = [];

  for (const document of documents) {
    const answerHtml = await renderMarkdown(document.answerMarkdown);
    const longHtml = await renderMarkdown(document.longMarkdown);
    const question = {
      id: document.frontmatter.id ?? null,
      slug: document.slug,
      title: document.frontmatter.title,
      categories: [...document.frontmatter.categories],
      authorId: document.frontmatter.authorId ?? null,
      published: document.frontmatter.published !== false,
      longAuthorId: document.frontmatter.longAuthorId ?? null,
      suppressAuthor: document.frontmatter.suppressAuthor === true,
      relatedAnswers: [...document.frontmatter.relatedAnswers],
      excerpt: document.excerpt,
      answerHtml,
      longHtml,
      groupCodes: document.groupCodes,
    };

    questions.push(question);

    if (!question.published) {
      continue;
    }

    const idLabel =
      question.groupCodes.length && typeof question.id === "number"
        ? `${question.groupCodes[0]}${question.id}`
        : typeof question.id === "number"
          ? String(question.id)
          : null;

    searchDocuments.push({
      id: question.id,
      idLabel,
      slug: question.slug,
      title: question.title,
      categories: question.categories,
      relatedAnswers: question.relatedAnswers,
      excerpt: question.excerpt,
      content: document.cleanedCombined,
      groupCodes: question.groupCodes,
      authorIds: deriveAuthorIds(question),
    });
  }

  questions.sort(compareQuestionArtifacts);
  searchDocuments.sort(compareQuestionArtifacts);

  return {
    questions,
    searchDocuments,
    categories,
  };
}

export async function writeQuestionArtifacts(artifacts) {
  await fs.mkdir(path.dirname(GENERATED_QUESTIONS_FILE), { recursive: true });
  await fs.mkdir(path.dirname(SEARCH_INDEX_FILE), { recursive: true });
  await fs.writeFile(GENERATED_QUESTIONS_FILE, JSON.stringify(artifacts.questions, null, 2));
  await fs.writeFile(SEARCH_INDEX_FILE, JSON.stringify(artifacts.searchDocuments, null, 2));
}

async function loadCategoryConfig() {
  const raw = await fs.readFile(CATEGORY_CONFIG_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function parseQuestionMarkdown(raw, fileName) {
  const normalized = normalizeNewlines(raw);
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${fileName} is missing required frontmatter.`);
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error(`${fileName} has an unterminated frontmatter block.`);
  }

  const yamlSource = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  const frontmatter = parseYaml(yamlSource) ?? {};

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error(`${fileName} has invalid frontmatter.`);
  }

  return {
    frontmatter,
    body,
  };
}

async function renderMarkdown(markdown = "") {
  const normalized = normalizeNewlines(markdown).trim();
  if (!normalized) {
    return "";
  }
  const file = await markdownProcessor.process(normalized);
  return String(file).trim();
}

function cleanMarkdown(markdown = "") {
  return normalizeNewlines(markdown)
    .replace(new RegExp(escapeRegExp(QUESTION_LONG_ANSWER_MARKER), "g"), " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\(([^)]+)\)/g, "$1 $2")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(text, wordLimit = 40) {
  if (!text) {
    return "";
  }
  const words = text.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, wordLimit).join(" ");
  return words.length > wordLimit ? `${excerpt}…` : excerpt;
}

function deriveGroupCodes(categories, categoryConfig) {
  const configMap = new Map();
  categoryConfig.forEach((entry) => {
    const slug = slugify(entry.id ?? entry.name ?? "");
    if (slug) {
      configMap.set(slug, entry);
    }
  });

  const codes = new Set();
  categories.forEach((label) => {
    const slug = slugify(label);
    const entry = configMap.get(slug);
    if (entry?.groupCode) {
      codes.add(String(entry.groupCode).toUpperCase());
    }
  });

  return [...codes];
}

function deriveAuthorIds(question) {
  const ids = new Set();
  if (question.authorId) {
    ids.add(String(question.authorId));
  }
  if (question.longAuthorId) {
    ids.add(String(question.longAuthorId));
  }
  return [...ids];
}

function compareQuestionArtifacts(a, b) {
  const aId = typeof a.id === "number" ? a.id : typeof a.frontmatter?.id === "number" ? a.frontmatter.id : Number.MAX_SAFE_INTEGER;
  const bId = typeof b.id === "number" ? b.id : typeof b.frontmatter?.id === "number" ? b.frontmatter.id : Number.MAX_SAFE_INTEGER;

  if (aId !== bId) {
    return aId - bId;
  }

  const aTitle = a.title ?? a.frontmatter?.title ?? "";
  const bTitle = b.title ?? b.frontmatter?.title ?? "";
  return aTitle.localeCompare(bTitle);
}

function validateQuestionDocuments(documents) {
  const slugSources = new Map();
  const idBuckets = new Map();
  const relatedTargets = new Set(documents.map((document) => document.slug));
  const errors = [];

  documents.forEach((document) => {
    const slugBucket = slugSources.get(document.slug) ?? [];
    slugBucket.push(document.fileName);
    slugSources.set(document.slug, slugBucket);

    if (typeof document.frontmatter.id === "number") {
      const bucket = idBuckets.get(document.frontmatter.id) ?? [];
      bucket.push(document);
      idBuckets.set(document.frontmatter.id, bucket);
    }
  });

  slugSources.forEach((sources, slug) => {
    if (sources.length > 1) {
      errors.push(`Duplicate slug "${slug}" found in: ${sources.join(", ")}`);
    }
  });

  idBuckets.forEach((bucket, id) => {
    const seenKeys = new Set();
    bucket.forEach((document) => {
      const keys = document.groupCodes.length ? document.groupCodes : ["UNGROUPED"];
      keys.forEach((key) => {
        const composite = `${id}:${key}`;
        if (seenKeys.has(composite)) {
          errors.push(`Duplicate numeric ID "${id}" within group "${key}" in ${bucket.map((entry) => entry.fileName).join(", ")}`);
        } else {
          seenKeys.add(composite);
        }
      });
    });
  });

  documents.forEach((document) => {
    document.frontmatter.relatedAnswers.forEach((slug) => {
      if (slug === document.slug) {
        errors.push(`${document.fileName} cannot reference itself in relatedAnswers.`);
        return;
      }
      if (!relatedTargets.has(slug)) {
        errors.push(`${document.fileName} references missing related answer "${slug}".`);
      }
    });
  });

  if (errors.length) {
    throw new Error(`Question integrity check failed:\n- ${errors.join("\n- ")}`);
  }
}

function normalizeNewlines(value = "") {
  return String(value).replace(/\r\n?/g, "\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
