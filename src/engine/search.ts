/**
 * Free academic and web source gatherers.
 * Spec: plans/modules/M03-source-gatherers.md
 * Enhanced with OpenAlex, Crossref, and full-snippet Web search.
 */

import type { Source } from "./types.js";

const UA = "ProjectAnveshan/0.2 (research; mailto:research@anveshan.org)";

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

async function getText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/xml, text/html, */*",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.text();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return match ? decodeXml(match[1]) : "";
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// 1. arXiv API (Preprints)
// ---------------------------------------------------------------------------

export async function searchArxiv(
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<Source[]> {
  try {
    const url =
      "https://export.arxiv.org/api/query?" +
      new URLSearchParams({
        search_query: `all:${query}`,
        start: "0",
        max_results: String(limit),
        sortBy: "relevance",
        sortOrder: "descending",
      });
    const xml = await getText(url, signal);
    const entries = xml.split("<entry>").slice(1);
    return entries.map((entry) => {
      const id = tag(entry, "id");
      const published = tag(entry, "published");
      const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(
        (m) => decodeXml(m[1]),
      );
      return {
        kind: "arxiv" as const,
        title: tag(entry, "title").replace(/\s+/g, " "),
        url: id,
        authors,
        year: published ? Number(published.slice(0, 4)) : undefined,
        venue: "arXiv",
        snippet: tag(entry, "summary").replace(/\s+/g, " ").slice(0, 800),
      };
    });
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. OpenAlex API (Peer-reviewed journals: Nature, Science, Elsevier, ACS)
// ---------------------------------------------------------------------------

export async function searchOpenAlex(
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<Source[]> {
  try {
    const url =
      "https://api.openalex.org/works?" +
      new URLSearchParams({
        search: query,
        per_page: String(limit),
        mailto: "research@anveshan.org",
      });
    const text = await getText(url, signal);
    const data = JSON.parse(text) as {
      results?: Array<{
        id?: string;
        title?: string;
        doi?: string;
        publication_year?: number;
        primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
        authorships?: Array<{ author?: { display_name?: string } }>;
        abstract_inverted_index?: Record<string, number[]>;
      }>;
    };

    return (data.results ?? []).map((item) => {
      // Reconstruct abstract from inverted index
      let abstract = "";
      if (item.abstract_inverted_index) {
        const words: string[] = [];
        for (const [word, posList] of Object.entries(item.abstract_inverted_index)) {
          for (const pos of posList) {
            words[pos] = word;
          }
        }
        abstract = words.filter(Boolean).join(" ");
      }

      const authors = (item.authorships ?? [])
        .map((a) => a.author?.display_name || "")
        .filter(Boolean);

      const href =
        item.doi ||
        item.primary_location?.landing_page_url ||
        (item.id ? `https://openalex.org/${item.id}` : "");

      return {
        kind: "semantic-scholar" as const, // Maps to peer-reviewed scholarly in UI/scoring
        title: item.title || "Untitled Paper",
        url: href,
        authors,
        year: item.publication_year,
        venue: item.primary_location?.source?.display_name || "Peer-Reviewed Journal",
        snippet: abstract.slice(0, 800) || `${item.title} (${item.primary_location?.source?.display_name || "Journal"})`,
      };
    });
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. Crossref API (Direct Publisher DOIs)
// ---------------------------------------------------------------------------

export async function searchCrossref(
  query: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<Source[]> {
  try {
    const url =
      "https://api.crossref.org/works?" +
      new URLSearchParams({
        query,
        rows: String(limit),
        mailto: "research@anveshan.org",
      });
    const text = await getText(url, signal);
    const data = JSON.parse(text) as {
      message?: {
        items?: Array<{
          title?: string[];
          DOI?: string;
          "container-title"?: string[];
          publisher?: string;
          abstract?: string;
          author?: Array<{ given?: string; family?: string }>;
          issued?: { "date-parts"?: number[][] };
          created?: { "date-parts"?: number[][] };
        }>;
      };
    };

    return (data.message?.items ?? []).map((item) => {
      const title = item.title?.[0] || "Untitled Crossref Entry";
      const year =
        item.issued?.["date-parts"]?.[0]?.[0] ||
        item.created?.["date-parts"]?.[0]?.[0];
      const venue = item["container-title"]?.[0] || item.publisher || "Crossref";
      const authors = (item.author ?? [])
        .map((a) => `${a.given || ""} ${a.family || ""}`.trim())
        .filter(Boolean);
      const rawAbstract = item.abstract ? stripTags(item.abstract) : "";

      return {
        kind: "crossref" as const,
        title,
        url: item.DOI ? `https://doi.org/${item.DOI}` : "",
        authors,
        year,
        venue,
        snippet: rawAbstract.slice(0, 800) || `${title} published in ${venue} (${year || "recent"}).`,
      };
    }).filter((s) => s.url);
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. Semantic Scholar API (with graceful fallback)
// ---------------------------------------------------------------------------

interface SemanticPaper {
  title?: string;
  url?: string;
  year?: number;
  venue?: string;
  abstract?: string;
  authors?: Array<{ name?: string }>;
  externalIds?: { ArXiv?: string; DOI?: string };
}

export async function searchSemanticScholar(
  query: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<Source[]> {
  try {
    const url =
      "https://api.semanticscholar.org/graph/v1/paper/search?" +
      new URLSearchParams({
        query,
        limit: String(limit),
        fields: "title,url,year,venue,abstract,authors,externalIds",
      });
    const text = await getText(url, signal);
    const payload = JSON.parse(text) as { data?: SemanticPaper[] };
    return (payload.data ?? []).map((paper) => {
      const arxiv = paper.externalIds?.ArXiv;
      const doi = paper.externalIds?.DOI;
      const href =
        paper.url ||
        (doi ? `https://doi.org/${doi}` : "") ||
        (arxiv ? `https://arxiv.org/abs/${arxiv}` : "");
      return {
        kind: "semantic-scholar" as const,
        title: paper.title || "Untitled",
        url: href,
        authors: (paper.authors ?? []).map((a) => a.name || "").filter(Boolean),
        year: paper.year,
        venue: paper.venue || "Semantic Scholar",
        snippet: (paper.abstract || "").slice(0, 800),
      };
    });
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return [];
  }
}

// ---------------------------------------------------------------------------
// 5. DuckDuckGo Web Search (with extracted snippets for evidence parsing)
// ---------------------------------------------------------------------------

export async function searchWeb(
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<Source[]> {
  try {
    const url =
      "https://html.duckduckgo.com/html/?" +
      new URLSearchParams({ q: query });
    const html = await getText(url, signal);
    const results: Source[] = [];

    const blocks = html.split('<div class="result results_links results_links_deep web-result ">');
    for (const b of blocks.slice(1)) {
      if (results.length >= limit) break;
      const urlMatch = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = b.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (urlMatch) {
        const rawHref = urlMatch[1];
        const parsed = new URL(rawHref, "https://html.duckduckgo.com");
        const uddg = parsed.searchParams.get("uddg");
        const link = uddg ? decodeURIComponent(uddg) : rawHref;
        const title = stripTags(urlMatch[2]);
        const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
        if (!link || !title || link.includes("duckduckgo.com")) continue;

        results.push({
          kind: "web" as const,
          title,
          url: link,
          snippet: snippet.slice(0, 800) || `${title}`,
        });
      }
    }
    return results;
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified Multi-Source Aggregator
// ---------------------------------------------------------------------------

export async function gatherSources(
  query: string,
  signal?: AbortSignal,
): Promise<Source[]> {
  const settled = await Promise.allSettled([
    searchOpenAlex(query, 4, signal),     // Peer-reviewed journals (Nature, Science, Elsevier, ACS)
    searchArxiv(query, 4, signal),        // Preprints
    searchCrossref(query, 3, signal),     // Publisher records & DOIs
    searchSemanticScholar(query, 3, signal),
    searchWeb(query, 4, signal),          // Web articles (techno-economics, cost, industry reports)
  ]);

  // If abort happened, surface it
  for (const item of settled) {
    if (item.status === "rejected" && isAbortError(item.reason, signal)) {
      throw item.reason;
    }
  }

  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    for (const source of item.value) {
      const key = (source.url || source.title).toLowerCase().trim();
      if (!key || !source.title || !source.url) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }
  }
  return sources;
}
