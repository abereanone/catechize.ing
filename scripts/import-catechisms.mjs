import { promises as fs } from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";

import {
  QUESTION_CONTENT_DIR,
  ROOT_DIR,
  serializeQuestionFrontmatter,
} from "./lib/questions-core.mjs";

const SOURCE_ROOT =
  process.env.SYMBOLICS_DATA_DIR || path.resolve(ROOT_DIR, "..", "symbolics-data");

const CATECHISM_SOURCES = [
  {
    sourceId: "bc1695",
    categoryId: "bc",
    questionDir: path.join("catechisms", "bc1695", "questions"),
  },
  {
    sourceId: "wsc",
    categoryId: "wsc",
    questionDir: path.join("catechisms", "wsc", "questions"),
  },
  {
    sourceId: "wlc",
    categoryId: "wlc",
    questionDir: path.join("catechisms", "wlc", "questions"),
  },
  {
    sourceId: "heidelberg",
    categoryId: "hc",
    questionDir: path.join("catechisms", "heidelberg"),
  },
  {
    sourceId: "aoc1680",
    categoryId: "aoc",
    questionDir: path.join("catechisms", "aoc1680", "questions"),
  },
];

const SOURCE_TO_CATEGORY_ID = new Map(
  CATECHISM_SOURCES.map((entry) => [entry.sourceId, entry.categoryId])
);

async function main() {
  await assertSourceRepo();

  const importedQuestions = await loadImportedQuestions();
  const slugBySourceAndId = buildSlugIndex(importedQuestions);
  const relatedAnswersBySlug = buildSymmetricRelatedAnswerMap(importedQuestions, slugBySourceAndId);

  await removeExistingImportedFiles();

  for (const question of importedQuestions) {
    const relatedAnswers = [...(relatedAnswersBySlug.get(question.slug) ?? [])].sort((left, right) =>
      left.localeCompare(right)
    );
    const frontmatter = {
      id: question.id,
      title: question.question,
      slug: question.slug,
      categories: [question.categoryId],
      relatedAnswers,
    };

    const document = [serializeQuestionFrontmatter(frontmatter), buildMarkdownBody(question)].join("\n\n");
    const targetPath = path.join(QUESTION_CONTENT_DIR, `${question.slug}.md`);
    await fs.writeFile(targetPath, `${document.trim()}\n`, "utf8");
  }

  console.log(
    `Imported ${importedQuestions.length} catechism questions from ${SOURCE_ROOT} into ${QUESTION_CONTENT_DIR}.`
  );
}

async function assertSourceRepo() {
  const stats = await fs
    .stat(SOURCE_ROOT)
    .catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(
      `symbolics-data repo not found at ${SOURCE_ROOT}. Set SYMBOLICS_DATA_DIR or place the repo next to catechize.ing.`
    );
  }
}

async function loadImportedQuestions() {
  const questions = [];

  for (const source of CATECHISM_SOURCES) {
    const absoluteDir = path.join(SOURCE_ROOT, source.questionDir);
    const fileNames = (await fs.readdir(absoluteDir))
      .filter((fileName) => fileName.endsWith(".yml"))
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of fileNames) {
      const absolutePath = path.join(absoluteDir, fileName);
      const raw = await fs.readFile(absolutePath, "utf8");
      const parsed = parseYaml(stripYamlLanguageServerComment(raw)) ?? {};

      const id = Number(parsed.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Invalid question id in ${absolutePath}`);
      }

      const questionText = String(parsed.question ?? "").trim();
      if (!questionText) {
        throw new Error(`Missing question text in ${absolutePath}`);
      }

      const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
      if (!segments.length) {
        throw new Error(`Missing answer segments in ${absolutePath}`);
      }

      const slug = `${source.categoryId}-${id}`;

      questions.push({
        sourceId: source.sourceId,
        categoryId: source.categoryId,
        id,
        slug,
        fileName,
        question: questionText,
        segments: segments.map((segment) => ({
          text: String(segment?.text ?? "").trim(),
          proofs: typeof segment?.proofs === "string" ? segment.proofs.trim() : "",
          note: typeof segment?.note === "string" ? segment.note.trim() : "",
        })),
        relations: parsed.relations && typeof parsed.relations === "object" ? parsed.relations : {},
      });
    }
  }

  return questions;
}

function buildSlugIndex(questions) {
  const index = new Map();

  questions.forEach((question) => {
    index.set(`${question.sourceId}:${question.id}`, question.slug);
  });

  return index;
}

function buildRelatedAnswers(relations, slugBySourceAndId) {
  const relatedAnswers = new Set();

  Object.entries(relations ?? {}).forEach(([sourceId, ids]) => {
    const normalizedSourceId = SOURCE_TO_CATEGORY_ID.has(sourceId) ? sourceId : null;
    if (!normalizedSourceId || !Array.isArray(ids)) {
      return;
    }

    ids.forEach((value) => {
      const normalizedId = Number(value);
      if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        return;
      }

      const slug = slugBySourceAndId.get(`${normalizedSourceId}:${normalizedId}`);
      if (slug) {
        relatedAnswers.add(slug);
      }
    });
  });

  return relatedAnswers;
}

function buildSymmetricRelatedAnswerMap(questions, slugBySourceAndId) {
  const map = new Map();

  questions.forEach((question) => {
    map.set(question.slug, buildRelatedAnswers(question.relations, slugBySourceAndId));
  });

  map.forEach((relatedAnswers, slug) => {
    relatedAnswers.forEach((relatedSlug) => {
      const reverseSet = map.get(relatedSlug);
      if (!reverseSet || relatedSlug === slug) {
        return;
      }

      reverseSet.add(slug);
    });
  });

  return map;
}

function buildMarkdownBody(question) {
  const answerText = question.segments
    .map((segment) => segment.text)
    .filter(Boolean)
    .join(" ")
    .trim();

  const proofLines = question.segments
    .filter((segment) => segment.text || segment.proofs || segment.note)
    .map((segment) => {
      const label = segment.text || "Segment";
      const extras = [];

      if (segment.proofs) {
        extras.push(`Proofs: ${segment.proofs}`);
      }

      if (segment.note) {
        extras.push(`Note: ${segment.note}`);
      }

      return extras.length ? `- ${label} (${extras.join(" | ")})` : `- ${label}`;
    });

  const parts = [answerText];

  if (proofLines.length) {
    parts.push(["## Proofs", ...proofLines].join("\n"));
  }

  return parts.join("\n\n").trim();
}

async function removeExistingImportedFiles() {
  const fileNames = await fs.readdir(QUESTION_CONTENT_DIR);
  const importedPrefixes = CATECHISM_SOURCES.map((entry) => `${entry.categoryId}-`);

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    if (!importedPrefixes.some((prefix) => fileName.startsWith(prefix))) {
      continue;
    }

    await fs.unlink(path.join(QUESTION_CONTENT_DIR, fileName));
  }
}

function stripYamlLanguageServerComment(raw) {
  return raw.replace(/^# yaml-language-server:.*(?:\r?\n)+/u, "");
}

await main();
