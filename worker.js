import { siteSettings } from "./src/config/siteSettings";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/audio/")) {
        return handleAudioRequest(request, url, env);
      }

      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        console.error("ASSETS binding unavailable on this deployment.");
        return new Response("Internal Server Error", { status: 500 });
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404 || request.method !== "GET") {
        return assetResponse;
      }

      const notFoundUrl = new URL("/404.html", request.url);
      const notFoundResponse = await env.ASSETS.fetch(notFoundUrl);

      if (notFoundResponse.status === 200) {
        const body = await notFoundResponse.arrayBuffer();
        return new Response(body, {
          status: 404,
          headers: new Headers(notFoundResponse.headers),
        });
      }

      return assetResponse;
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

const AUDIO_KEY_PATTERN = /^[a-z]+-\d+\.mp3$/;
const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Serves catechism recordings out of R2 at /audio/<slug>.mp3.
 *
 * Same-origin on purpose: a cross-origin URL would make the download links on
 * question pages fall back to playback, because browsers ignore the anchor
 * `download` attribute across origins.
 */
async function handleAudioRequest(request, url, env) {
  // The same flag that hides the players hides the route. Without this the
  // recordings would be fetchable at guessable URLs the moment this deploys,
  // whether or not anything on the site links to them.
  if (!siteSettings.enableAudio) {
    return new Response("Not Found", { status: 404 });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  if (!env.AUDIO || typeof env.AUDIO.get !== "function") {
    console.error("AUDIO binding unavailable on this deployment.");
    return new Response("Audio unavailable", { status: 500 });
  }

  const name = url.pathname.slice("/audio/".length);

  // Keys are generated, never user-supplied, so anything unusual is a probe.
  if (!AUDIO_KEY_PATTERN.test(name)) {
    return new Response("Not Found", { status: 404 });
  }

  const key = `${name.slice(0, name.indexOf("-"))}/${name}`;
  const range = request.headers.get("range");
  const conditional = parseConditionalHeaders(request);

  // Seeking in an <audio> element depends on ranged responses, so hand the
  // Range header to R2 rather than reading the whole object and slicing it.
  const object = await env.AUDIO.get(key, {
    range: range ? request.headers : undefined,
    onlyIf: conditional,
  });

  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", AUDIO_CACHE_CONTROL);
  headers.set("content-type", "audio/mpeg");

  const filename = url.searchParams.get("download");
  if (filename) {
    headers.set("content-disposition", `attachment; filename="${sanitizeFilename(filename)}"`);
  }

  // R2 returns a body-less object when `onlyIf` fails, i.e. the client's copy
  // is still good.
  if (!("body" in object) || object.body === undefined) {
    return new Response(null, { status: 304, headers });
  }

  // R2 fills in `object.range` even for unranged reads, so key the 206 off the
  // request rather than the response: a bare GET must be a 200.
  if (range && object.range && typeof object.range.offset === "number") {
    const start = object.range.offset;
    const end = start + (object.range.length ?? 0) - 1;
    headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    headers.set("content-length", String(object.range.length ?? 0));

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 206,
      headers,
    });
  }

  headers.set("content-length", String(object.size));

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
}

function parseConditionalHeaders(request) {
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  if (!ifNoneMatch && !ifModifiedSince) {
    return undefined;
  }

  return request.headers;
}

/** Content-Disposition breaks on quotes and newlines; strip rather than escape. */
function sanitizeFilename(value) {
  const cleaned = value
    .replace(/[\r\n"\\]/g, "")
    .replace(/[/\\]/g, "-")
    .trim()
    .slice(0, 120);

  return cleaned || "audio.mp3";
}

