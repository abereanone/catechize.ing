# catechize.ing

Static Astro site for catechize.ing, publishing question-and-answer content, category pages, author pages, and search.

## Stack

- [Astro](https://astro.build/) 6.x
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
|   |-- lib/questions-core.mjs     # Shared question parsing/serialising
|   |-- build-questions.mjs        # Generates question/search artifacts
|   |-- build-bible-cited.mjs      # Generates the cited-scripture artifact
|   |-- build-audio-manifest.mjs   # Ad hoc; writes src/generated/audio.json
|   |-- check-questions.mjs        # Validates question files without writing
|   |-- import-catechisms.mjs      # Ad hoc bulk import
|   |-- new-question.mjs           # Scaffolds a new question file
|   `-- stage-audio.mjs            # Ad hoc; renames recordings by question slug
|-- src/
|   |-- components/                # Reusable UI pieces
|   |-- config/                    # Site-wide settings
|   |-- content/questions/         # Canonical question files with frontmatter
|   |-- data/
|   |   |-- categories.json        # Optional category sort/group config
|   |   `-- resources.json         # Optional author/resource metadata
|   |-- generated/                 # questions.json + bible-cited.json are
|   |                              # rebuilt on build/dev and ignored by git;
|   |                              # audio.json is committed
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
- `npm run build:bible` - regenerate `src/generated/bible-cited.json`.
- `npm run check:questions` - validate question files without writing generated output.
- `npm run new:question -- "Title"` - scaffold a new question Markdown file with the next numeric ID.
- `npm run import:catechisms` - bulk-import catechism content into question files.
- `npm run seed:bsb` - prepare the BSB Bible dataset in `bsb-data-pipeline/`.
- `npm run build` - production build.
- `npm run preview` - preview the production build locally.
- `npm run astro ...` - run the Astro CLI directly.

Ad-hoc tools, run directly rather than through npm. These depend on local files
that are not in the repo, so they must never run as part of a build:

- `node ./scripts/stage-audio.mjs --src "<album folder>"` - copy the Baptist
  Catechism recordings into `.audio-staging/` renamed by question slug
  (`bc-1.mp3` .. `bc-114.mp3`). Dry run unless given `--apply`.
- `node ./scripts/build-audio-manifest.mjs` - read durations from the staged
  files with `ffprobe` and write `src/generated/audio.json`. Unlike the other
  generated artifacts this one is committed, because a build cannot recreate it.

## Deployment

The site runs on Cloudflare Workers via `worker.js`, which serves the built
static output, the `/api/search` endpoint, and `/audio/*`. Configuration lives
in `wrangler.jsonc`.

```bash
npm run build
npx wrangler deploy
```

The Cloudflare login is a member of several accounts, so `account_id` is pinned
in `wrangler.jsonc`; without it wrangler cannot choose one non-interactively.

To exercise the audio routes locally you need the real bucket, since a local R2
simulator is empty:

```bash
npx wrangler dev --remote
```

## Audio

Recordings of the Baptist Catechism, one track per question for `bc-1` through
`bc-114`. `bc-115`+ and every other catechism have no audio and render nothing.

- Files live in the private R2 bucket `catechize-audio` under `bc/bc-<n>.mp3`.
  The bucket has no public access and no custom domain.
- `worker.js` serves them same-origin at `/audio/bc-<n>.mp3`. Same-origin
  matters: browsers ignore an anchor's `download` attribute across origins, so
  a bucket custom domain would turn the download links into playback.
- Range requests are passed through to R2 so seeking works.
- `?download=<filename>` adds a `Content-Disposition` header for a real save
  with a readable filename.
- `src/generated/audio.json` supplies durations; `src/lib/audio.ts` resolves a
  question to a track.
- `siteSettings.enableAudio` gates the whole feature. While it is `false` the
  players and `/listen` render nothing.

## Notes for Future Updates

- `src/lib/questions.ts` reads from `src/generated/questions.json`, not directly from the Markdown files.
- Search UI source lives in `public/assets/search-client.js`.
- `worker.js` uses `public/assets/search-index.json` for the `/api/search` endpoint.
- The source of truth for question content is always `src/content/questions/*.md`.
- If the generated JSON files are removed from git, `npm run dev` and `npm run build` will recreate them automatically.

## License

MIT - see `LICENSE`.
