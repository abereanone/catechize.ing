# Audio feature

Recordings of the Baptist Catechism set to music by James Scott Orrick, one
track per question. Built, deployed, and switched off.

**Status: waiting on distribution permission from Orrick.** Nothing is publicly
reachable until that arrives.

---

## The switch

```ts
// src/config/siteSettings.ts
enableAudio: false as boolean,
```

That one flag gates both halves:

- the players on question pages and the contents of `/listen`
- the `/audio/*` route in `worker.js`

The route is gated deliberately. Without it the recordings would be fetchable
at guessable URLs (`/audio/bc-1.mp3` .. `/audio/bc-114.mp3`) the moment the
site deployed, whether or not anything linked to them.

Flip to `true`, commit, push. Cloudflare Pages auto-deploys from `main`. That is
the whole go-live procedure.

---

## What exists

### The files

| Where | What |
| --- | --- |
| R2 bucket `catechize-audio` | 114 MP3s under `bc/bc-1.mp3` .. `bc/bc-114.mp3`. No public access, no custom domain. |
| `.audio-staging/bc/` | Local renamed copies, gitignored, 152 MB. Source of the upload. |
| Proton Drive iTunes library | The originals. Never modified. |

Disc 1 track *N* maps to `bc-N`; disc 2 track *N* maps to `bc-(N + 61)`. Every
track title was checked against the question `title:` frontmatter — a clean 1:1
across all 114. `bc-115` through `bc-118` postdate the album and have no audio,
as does every other catechism on the site.

### The code

| File | Role |
| --- | --- |
| `scripts/stage-audio.mjs` | Copies the album into `.audio-staging/` renamed by question slug. Dry run unless `--apply`. Never renames the originals — they live in an iTunes library. |
| `scripts/build-audio-manifest.mjs` | Reads durations via `ffprobe`, writes `src/generated/audio.json`. |
| `src/generated/audio.json` | 114 entries of duration + byte size. **Committed**, unlike the other generated artifacts, because a build cannot recreate it. |
| `src/lib/audio.ts` | Resolves a question to a track; builds the download filename. |
| `src/components/QuestionAudio.astro` | Player under each answer. `preload="none"`. |
| `src/pages/listen.astro` | Play-all page, all 114 tracks. |
| `worker.js` | Serves `/audio/*` from R2. |

Both scripts are ad hoc. They depend on local files that are not in the repo and
must never run during a build.

---

## Why there is a worker

This is the confusing part, so: **the worker exists only to serve audio.**

`worker.js` is bundled to `dist/_worker.js` by the `postbuild` step. Cloudflare
Pages runs any `_worker.js` it finds in the build output instead of serving
files directly, which is why a worker-looking entry appears in the dashboard.
It is not a separate app — no separate URL, no separate deployment, no
standalone Worker on the account. It ships and dies with the Pages project.

Its whole job:

1. `/audio/…` → fetch from R2 (currently 404s, flag is off)
2. anything else → `env.ASSETS`, i.e. the normal static site
3. asset 404 → serve `404.html`

### Why not just point a subdomain at the bucket

Because of the download link. Browsers **ignore an anchor's `download`
attribute across origins**. On `audio.catechize.ing` the Download button would
navigate to a bare MP3 and play it rather than saving it. Setting
`Content-Disposition: attachment` on the objects fixes downloads but then
breaks inline playback, since every request becomes a forced download.

Serving same-origin from `catechize.ing/audio/…` avoids the whole problem, and
keeps the bucket private so the feature has an off state while permission is
pending.

The sister sites (`macaudio`, `JDAudio`) both use the subdomain approach and
both have this download bug live today. Fix for those, when we get to it: put a
worker on the audio hostname that honours `?download=1` with a
`Content-Disposition` header — that works cross-origin because it is a server
instruction rather than an HTML hint.

---

## If the answer is no — removing it

The site returns to pure static hosting. Delete:

1. `worker.js`
2. `"build:worker"` and `"postbuild"` from `package.json`
3. the `esbuild` devDependency
4. the `[[r2_buckets]]` blocks from `wrangler.toml` (keep the rest — it is the
   real Pages config)
5. `src/components/QuestionAudio.astro`, `src/lib/audio.ts`,
   `src/pages/listen.astro`, `src/generated/audio.json`
6. `enableAudio` / `audioCredit` from `src/config/siteSettings.ts`, and the
   `<QuestionAudio>` usage in `src/pages/questions/[slugOrId].astro`

Then delete the R2 bucket and `.audio-staging/`. Keep the two scripts if the
mapping work is worth preserving; they are harmless.

Note that removing `_worker.js` also removes the routing layer that currently
handles every request. That is fine — Pages served this site natively before,
and the asset-fallthrough and 404 logic in `worker.js` only duplicates what
Pages does on its own.

## If the answer is yes — the subdomain option is still open

Nothing here is locked in. The R2 keys do not change, so switching to
`audio.catechize.ing` later means pointing the player at a different base URL
and deleting the worker. Roughly twenty minutes. The tradeoff is the download
link, above.

---

## Things that cost time, worth not rediscovering

- The Cloudflare login belongs to **nine accounts**, so wrangler cannot pick one
  non-interactively. Set `CLOUDFLARE_ACCOUNT_ID=6481c7e370bbed874eb7679096eb1612`
  or rely on `account_id` in the config.
- `wrangler r2 object get` defaults to a **local simulator** and reports "key
  does not exist" for objects that are really there. Pass `--remote`.
- `wrangler r2 object list` does not exist in wrangler 4. `r2 bucket info` gives
  a count, but the count lags several minutes behind reality.
- `wrangler pages dev` has **no remote-bindings flag**, so the audio route
  cannot be tested against the real bucket locally. Either load a file into the
  local R2 simulator with `--local`, or verify after deploying.
- R2 populates `object.range` even on unranged reads. Keying the `206` off that
  makes every plain `GET` a `206`; key it off the request's `Range` header.
- `as const` on `siteSettings` narrows `enableAudio` to the literal `false`,
  which makes `=== true` a type error under `astro check`. Hence `as boolean`.

## Pre-existing things found along the way

- `/api/search` had **never worked in production**. `worker.js` dated from the
  first commit and Pages had never run it. Nothing called the endpoint — the
  search box fetches `/assets/search-index.json` and searches in the browser —
  so it was removed rather than fixed. It is recoverable from
  `git show fde03bc:worker.js`.
- Deleting it took the worker bundle from 1.4 MB to 5 KB (300 KB → 1.9 KB
  gzipped), which matters now that the worker runs on every request.
- The README claimed a `wrangler.toml` existed. None did. There is one now, and
  it is Pages-shaped (`pages_build_output_dir`), not Workers-shaped.
