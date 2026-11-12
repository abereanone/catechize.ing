import { promises as fs } from "node:fs";
import path from "node:path";

import siteConfig from "./site.config.mjs";

import {
  QUESTION_CONTENT_DIR,
  detectFirstAvailableQuestionId,
  loadQuestionDocuments,
  serializeQuestionFrontmatter,
  slugify,
} from "./lib/questions-core.mjs";

const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: npm run new:question -- "Your question title"');
  process.exit(1);
}

const slug = slugify(title);
if (!slug) {
  console.error("Could not derive a slug from that title.");
  process.exit(1);
}

const { documents } = await loadQuestionDocuments();
const nextId = detectFirstAvailableQuestionId(documents);
const targetPath = path.join(QUESTION_CONTENT_DIR, `${slug}.md`);

try {
  await fs.access(targetPath);
  console.error(`Question file already exists: ${targetPath}`);
  process.exit(1);
} catch {
  // File does not exist.
}

const frontmatter = serializeQuestionFrontmatter({
  id: nextId,
  title,
  categories: ["Biblical"],
  // The site's own default (scripts/site.config.mjs), else the curator.
  authorId: siteConfig.defaultAuthorId ?? "mac",
});

// Only sites that show long answers get the long section in a new file.
const template =
  siteConfig.longAnswers === false
    ? `${frontmatter}

Write the answer here.
`
    : `${frontmatter}

Write the short answer here.

${"<!-- LONG_ANSWER -->"}

## Long Explanation

Expand the answer here if needed.
`;

await fs.writeFile(targetPath, template);

console.log(`Created ${path.relative(process.cwd(), targetPath)} with ID ${nextId}.`);
