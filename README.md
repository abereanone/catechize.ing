# catechize.ing

Static Astro site for catechize.ing, publishing question-and-answer content, category pages, author pages, and search.

## Stack

- [Astro](https://astro.build/) 5.x
- TypeScript project configuration (`tsconfig.json`)
- Markdown content in `src/content/questions/`
- Generated question/search artifacts for fast page rendering
- Static assets in `public/`

## Project Structure

```text
.
|-- public/
|   |-- assets/search-client.js    # Search UI source file
|   `-- styles/theme.css           # Shared theme styles
|-- scripts/
|   |-- build-questions.mjs        # Generates question/search artifacts
|   |-- check-questions.mjs        # Validates question files without writing
|   `-- new-question.mjs           # Scaffolds a new question file
|-- src/
|   |-- components/                # Reusable UI pieces
|   |-- config/                    # Site-wide settings
|   |-- content/questions/         # Canonical question files with frontmatter
|   |-- data/
|   |   |-- categories.json        # Optional category sort/group config
|   |   `-- resources.json         # Optional author/resource metadata
|   |-- generated/questions.json   # Generated on build/dev; ignored by git
|   |-- layouts/
|   |-- lib/
|   `-- pages/
|-- package.json
`-- worker.js
```

## Canonical Content Model

Each question lives in one Markdown file under `src/content/questions/`.

Example:

```md
---
id: 1
title: Who is God?
categories:
  - bc
authorId: mac
---

God is our God

<!-- LONG_ANSWER -->

## Long Explanation

Optional extended answer goes here.
```

Notes:

- The filename is the default slug. Add `slug:` in frontmatter only if you need a custom URL.
- `published` defaults to `true`.
- `suppressAuthor` defaults to `false`.
- `relatedAnswers` uses slugs, not numeric IDs.
- `<!-- LONG_ANSWER -->` is optional. Content below it becomes the expandable long explanation.

## Generated Files

These are generated and should not be edited by hand:

- `src/generated/questions.json`
- `public/assets/search-index.json`

They are rebuilt from the Markdown question files by `npm run build:questions`.
They are intended to be untracked build artifacts, not source files.

## Local Development

Requirements: Node.js 18.20.8+ and npm.

```bash
npm install
npm run dev
```

`npm run dev` regenerates the question/search artifacts first, then starts Astro at `http://localhost:4321/`.

## Build and Preview

```bash
npm run build
npm run preview
```

`npm run build` regenerates the question/search artifacts before running `astro build`.

## Content Workflow

1. Create a new question with `npm run new:question -- "Your title here"` or add a Markdown file manually under `src/content/questions/`.
2. Fill in the frontmatter and body in that file.
3. If needed, add `<!-- LONG_ANSWER -->` and place the extended explanation below it.
4. Update `src/data/categories.json` only when you need category sort order or a `groupCode`.
5. Update `src/data/resources.json` only when you need author/resource metadata such as name, bio, URL, or sort order.
6. Run `npm run check:questions` to validate the corpus.
7. Run `npm run build:questions` if you want to refresh the generated artifacts without doing a full site build.

## Grouped Question IDs

- Add `groupCode` to a category in `src/data/categories.json` to place questions in a named group.
- Questions tagged with that category get grouped ID routes such as `/questions/WSC8`.
- Visiting `/questions/<id>` still works. If multiple grouped questions share that numeric ID, the site shows a selection page.

Example category config:

```json
[
  { "id": "biblical", "name": "Biblical", "sortOrder": 10, "groupCode": "BIB" },
  { "id": "practical", "name": "Practical", "sortOrder": 50, "groupCode": "PR" }
]
```

Example effect:

- A question with `id: 41` in the `Biblical` category can be reached at `/questions/BIB41`.
- A different question with `id: 41` in the `Practical` category can be reached at `/questions/PR41`.
- If no category on a question has a `groupCode`, the question just uses its normal numeric or slug route.

## Scripts

- `npm run dev` - rebuild generated content, then start the local Astro dev server.
- `npm run build:questions` - validate question files and regenerate `src/generated/questions.json` plus `public/assets/search-index.json`.
- `npm run check:questions` - validate question files without writing generated output.
- `npm run new:question -- "Title"` - scaffold a new question Markdown file with the next numeric ID.
- `npm run build` - production build.
- `npm run preview` - preview the production build locally.
- `npm run astro ...` - run the Astro CLI directly.

## Deployment

The repo includes `wrangler.toml` for Cloudflare Workers.

```bash
npm run build
npx wrangler deploy
```

## Notes for Future Updates

- `src/lib/questions.ts` reads from `src/generated/questions.json`, not directly from the Markdown files.
- Search UI source lives in `public/assets/search-client.js`.
- `worker.js` uses `public/assets/search-index.json` for the `/api/search` endpoint.
- The source of truth for question content is always `src/content/questions/*.md`.
- If the generated JSON files are removed from git, `npm run dev` and `npm run build` will recreate them automatically.

## License

MIT - see `LICENSE`.
