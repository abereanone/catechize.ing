import searchDataset from "./public/assets/search-index.json";
import { clampNumber, createSearchEngine, searchIndex } from "./src/lib/search-engine.js";

const searchEngine = createSearchEngine(Array.isArray(searchDataset) ? searchDataset : []);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/search")) {
        return handleSearchRequest(request, url);
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

function handleSearchRequest(request, url) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawQuery = url.searchParams.get("q") ?? "";
  const query = rawQuery.trim();

  if (!query) {
    return jsonResponse({ error: "Query parameter 'q' is required." }, 400);
  }

  const limit = clampNumber(parseInt(url.searchParams.get("limit") ?? "10", 10), 1, 25);
  const categoryFilters = url.searchParams.getAll("category").filter(Boolean);

  const matches = searchIndex(searchEngine, query, {
    limit,
    categories: categoryFilters,
  });

  return jsonResponse(
    {
      query,
      total: matches.total,
      results: matches.items,
    },
    200
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
