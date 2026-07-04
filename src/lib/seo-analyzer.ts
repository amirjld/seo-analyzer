import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_HTML_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 12_000;
const ASSET_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;

type CheckStatus = "pass" | "warn" | "fail";
type Priority = "high" | "medium" | "low";

export type SeoCheck = {
  category: "content" | "technical" | "links" | "media" | "social";
  label: string;
  status: CheckStatus;
  detail: string;
};

export type SeoRecommendation = {
  priority: Priority;
  title: string;
  detail: string;
};

type FetchResult = {
  url: string;
  status: number;
  headers: Headers;
  html: string;
  responseMs: number;
};

export type SeoAnalysis = {
  requestedUrl: string;
  finalUrl: string;
  fetchedAt: string;
  status: number;
  responseMs: number;
  htmlBytes: number;
  scores: {
    overall: number;
    content: number;
    technical: number;
    links: number;
    media: number;
    social: number;
  };
  page: {
    title: string;
    titleLength: number;
    description: string;
    descriptionLength: number;
    canonical: string;
    robotsMeta: string;
    lang: string;
    charset: string;
    viewport: string;
    h1: string[];
    h2Count: number;
    wordCount: number;
    imageCount: number;
    imagesMissingAlt: number;
    internalLinks: number;
    externalLinks: number;
    nofollowLinks: number;
    structuredDataTypes: string[];
    openGraphTags: number;
    twitterTags: number;
    robotsTxtFound: boolean;
    sitemapFound: boolean;
  };
  checks: SeoCheck[];
  recommendations: SeoRecommendation[];
};

export async function analyzeUrl(input: string): Promise<SeoAnalysis> {
  const requestedUrl = normalizeUrl(input);
  const fetched = await fetchHtmlWithRedirects(requestedUrl);
  const $ = cheerio.load(fetched.html);
  const finalUrl = new URL(fetched.url);
  const origin = finalUrl.origin;

  const [robotsTxt, sitemapXml] = await Promise.all([
    fetchOptionalText(new URL("/robots.txt", origin).toString()),
    fetchOptionalText(new URL("/sitemap.xml", origin).toString())
  ]);

  const meta = readMetaTags($);
  const title = normalizeText($("title").first().text());
  const description = normalizeText(meta.name.description ?? "");
  const canonical = resolveMaybeUrl(
    $("link[rel~='canonical']").first().attr("href") ?? "",
    finalUrl
  );
  const robotsMeta = normalizeText(meta.name.robots ?? "");
  const lang = normalizeText($("html").attr("lang") ?? "");
  const charset = normalizeText(
    $("meta[charset]").first().attr("charset") ??
      parseCharset(meta.httpEquiv["content-type"] ?? "") ??
      ""
  );
  const viewport = normalizeText(meta.name.viewport ?? "");
  const h1 = $("h1")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter(Boolean);
  const h2Count = $("h2").length;
  const bodyText = normalizeText($("body").text());
  const wordCount = countWords(bodyText);

  const images = $("img").toArray();
  const imagesMissingAlt = images.filter((image) => {
    const alt = $(image).attr("alt");
    return alt === undefined || normalizeText(alt).length === 0;
  }).length;

  const linkStats = readLinks($, finalUrl);
  const structuredDataTypes = readStructuredDataTypes($);
  const openGraphTags = Object.keys(meta.property).filter((key) =>
    key.startsWith("og:")
  ).length;
  const twitterTags = Object.keys(meta.name).filter((key) =>
    key.startsWith("twitter:")
  ).length;
  const robotsTxtFound = robotsTxt.ok;
  const sitemapFound =
    sitemapXml.ok || /(?:^|\n)\s*sitemap\s*:/i.test(robotsTxt.text);

  const checks = buildChecks({
    requestedUrl,
    finalUrl,
    title,
    description,
    canonical,
    robotsMeta,
    lang,
    charset,
    viewport,
    h1,
    h2Count,
    wordCount,
    images: images.length,
    imagesMissingAlt,
    ...linkStats,
    structuredDataTypes,
    openGraphTags,
    twitterTags,
    robotsTxtFound,
    sitemapFound,
    responseMs: fetched.responseMs,
    htmlBytes: byteLength(fetched.html),
    status: fetched.status
  });

  const scores = calculateScores(checks);
  const recommendations = buildRecommendations(checks, {
    title,
    description,
    h1Count: h1.length,
    imagesMissingAlt,
    wordCount,
    hasNoindex: /noindex/i.test(robotsMeta),
    responseMs: fetched.responseMs
  });

  return {
    requestedUrl,
    finalUrl: fetched.url,
    fetchedAt: new Date().toISOString(),
    status: fetched.status,
    responseMs: fetched.responseMs,
    htmlBytes: byteLength(fetched.html),
    scores,
    page: {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description.length,
      canonical,
      robotsMeta,
      lang,
      charset,
      viewport,
      h1,
      h2Count,
      wordCount,
      imageCount: images.length,
      imagesMissingAlt,
      internalLinks: linkStats.internalLinks,
      externalLinks: linkStats.externalLinks,
      nofollowLinks: linkStats.nofollowLinks,
      structuredDataTypes,
      openGraphTags,
      twitterTags,
      robotsTxtFound,
      sitemapFound
    },
    checks,
    recommendations
  };
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be analyzed.");
  }

  url.hash = "";
  return url.toString();
}

async function fetchHtmlWithRedirects(url: string): Promise<FetchResult> {
  let current = url;
  const started = performance.now();

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicTarget(current);
    const response = await fetchWithTimeout(current, REQUEST_TIMEOUT_MS, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "SEOAnalyzerBot/1.0 (+https://local.dev; on-page seo analyzer)"
      }
    });

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("The site returned a redirect without a location.");
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`The site returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xml|text/i.test(contentType)) {
      throw new Error("The URL did not return an HTML page.");
    }

    const html = await readLimitedResponse(response, MAX_HTML_BYTES);
    return {
      url: current,
      status: response.status,
      headers: response.headers,
      html,
      responseMs: Math.round(performance.now() - started)
    };
  }

  throw new Error("The site redirected too many times.");
}

async function fetchOptionalText(url: string) {
  try {
    await assertPublicTarget(url);
    const response = await fetchWithTimeout(url, ASSET_TIMEOUT_MS, {
      redirect: "follow",
      headers: {
        accept: "text/plain,text/xml,application/xml,*/*",
        "user-agent": "SEOAnalyzerBot/1.0"
      }
    });

    if (!response.ok) {
      return { ok: false, text: "" };
    }

    return {
      ok: true,
      text: await readLimitedResponse(response, 250_000)
    };
  } catch {
    return { ok: false, text: "" };
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedResponse(response: Response, maxBytes: number) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      throw new Error("The page is too large to analyze safely.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

async function assertPublicTarget(rawUrl: string) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Local and private network URLs are not allowed.");
  }

  const hostWithoutBrackets = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostWithoutBrackets)) {
    if (isPrivateIp(hostWithoutBrackets)) {
      throw new Error("Local and private network URLs are not allowed.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateIp(address.address))
  ) {
    throw new Error("Local and private network URLs are not allowed.");
  }
}

function isPrivateIp(address: string) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  return true;
}

function readMetaTags($: cheerio.CheerioAPI) {
  const name: Record<string, string> = {};
  const property: Record<string, string> = {};
  const httpEquiv: Record<string, string> = {};

  $("meta").each((_, element) => {
    const content = normalizeText($(element).attr("content") ?? "");
    const nameKey = normalizeText($(element).attr("name") ?? "").toLowerCase();
    const propertyKey = normalizeText(
      $(element).attr("property") ?? ""
    ).toLowerCase();
    const httpEquivKey = normalizeText(
      $(element).attr("http-equiv") ?? ""
    ).toLowerCase();

    if (nameKey) name[nameKey] = content;
    if (propertyKey) property[propertyKey] = content;
    if (httpEquivKey) httpEquiv[httpEquivKey] = content;
  });

  return { name, property, httpEquiv };
}

function readLinks($: cheerio.CheerioAPI, baseUrl: URL) {
  let internalLinks = 0;
  let externalLinks = 0;
  let nofollowLinks = 0;

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return;

    try {
      const link = new URL(href, baseUrl);
      if (link.protocol !== "http:" && link.protocol !== "https:") return;

      if (link.hostname === baseUrl.hostname) {
        internalLinks += 1;
      } else {
        externalLinks += 1;
      }

      const rel = ($(element).attr("rel") ?? "").toLowerCase();
      if (rel.split(/\s+/).includes("nofollow")) {
        nofollowLinks += 1;
      }
    } catch {
      // Invalid hrefs are ignored because they are not crawlable URLs.
    }
  });

  return { internalLinks, externalLinks, nofollowLinks };
}

function readStructuredDataTypes($: cheerio.CheerioAPI) {
  const types = new Set<string>();

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        collectSchemaTypes(item, types);
      }
    } catch {
      types.add("Invalid JSON-LD");
    }
  });

  return Array.from(types).sort();
}

function collectSchemaTypes(value: unknown, types: Set<string>) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaTypes(item, types));
    return;
  }

  const record = value as Record<string, unknown>;
  const schemaType = record["@type"];
  if (typeof schemaType === "string") {
    types.add(schemaType);
  } else if (Array.isArray(schemaType)) {
    schemaType.forEach((item) => {
      if (typeof item === "string") types.add(item);
    });
  }

  for (const nested of Object.values(record)) {
    if (typeof nested === "object") {
      collectSchemaTypes(nested, types);
    }
  }
}

function buildChecks(input: {
  requestedUrl: string;
  finalUrl: URL;
  title: string;
  description: string;
  canonical: string;
  robotsMeta: string;
  lang: string;
  charset: string;
  viewport: string;
  h1: string[];
  h2Count: number;
  wordCount: number;
  images: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  nofollowLinks: number;
  structuredDataTypes: string[];
  openGraphTags: number;
  twitterTags: number;
  robotsTxtFound: boolean;
  sitemapFound: boolean;
  responseMs: number;
  htmlBytes: number;
  status: number;
}): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const titleLength = input.title.length;
  const descriptionLength = input.description.length;

  checks.push({
    category: "technical",
    label: "HTTPS",
    status: input.finalUrl.protocol === "https:" ? "pass" : "fail",
    detail:
      input.finalUrl.protocol === "https:"
        ? "The page is served over HTTPS."
        : "The page is not served over HTTPS."
  });
  checks.push({
    category: "technical",
    label: "HTTP status",
    status: input.status === 200 ? "pass" : "warn",
    detail: `The analyzed page returned HTTP ${input.status}.`
  });
  checks.push({
    category: "technical",
    label: "Response time",
    status:
      input.responseMs <= 1200 ? "pass" : input.responseMs <= 2500 ? "warn" : "fail",
    detail: `The HTML response took ${input.responseMs} ms.`
  });
  checks.push({
    category: "technical",
    label: "HTML size",
    status:
      input.htmlBytes <= 500_000
        ? "pass"
        : input.htmlBytes <= 1_000_000
          ? "warn"
          : "fail",
    detail: `The HTML document is ${formatBytes(input.htmlBytes)}.`
  });
  checks.push({
    category: "technical",
    label: "Canonical URL",
    status: input.canonical ? "pass" : "warn",
    detail: input.canonical
      ? `Canonical points to ${input.canonical}.`
      : "No canonical URL was found."
  });
  checks.push({
    category: "technical",
    label: "Indexability",
    status: /noindex/i.test(input.robotsMeta) ? "fail" : "pass",
    detail: input.robotsMeta
      ? `Robots meta is "${input.robotsMeta}".`
      : "No blocking robots meta directive was found."
  });
  checks.push({
    category: "technical",
    label: "Mobile viewport",
    status: /width\s*=\s*device-width/i.test(input.viewport) ? "pass" : "fail",
    detail: input.viewport
      ? `Viewport is "${input.viewport}".`
      : "No mobile viewport meta tag was found."
  });
  checks.push({
    category: "technical",
    label: "Language",
    status: input.lang ? "pass" : "warn",
    detail: input.lang
      ? `HTML language is "${input.lang}".`
      : "The html tag does not declare a language."
  });
  checks.push({
    category: "technical",
    label: "Charset",
    status: input.charset ? "pass" : "warn",
    detail: input.charset
      ? `Charset is "${input.charset}".`
      : "No charset declaration was found."
  });
  checks.push({
    category: "technical",
    label: "Robots.txt",
    status: input.robotsTxtFound ? "pass" : "warn",
    detail: input.robotsTxtFound
      ? "A robots.txt file is reachable."
      : "No reachable robots.txt file was found."
  });
  checks.push({
    category: "technical",
    label: "Sitemap",
    status: input.sitemapFound ? "pass" : "warn",
    detail: input.sitemapFound
      ? "A sitemap was found directly or referenced in robots.txt."
      : "No sitemap was found at /sitemap.xml or in robots.txt."
  });
  checks.push({
    category: "technical",
    label: "Structured data",
    status:
      input.structuredDataTypes.length === 0
        ? "warn"
        : input.structuredDataTypes.includes("Invalid JSON-LD")
          ? "fail"
          : "pass",
    detail:
      input.structuredDataTypes.length > 0
        ? `Detected: ${input.structuredDataTypes.join(", ")}.`
        : "No JSON-LD structured data was found."
  });

  checks.push({
    category: "content",
    label: "Title tag",
    status:
      titleLength >= 30 && titleLength <= 60
        ? "pass"
        : titleLength > 0
          ? "warn"
          : "fail",
    detail: titleLength
      ? `Title is ${titleLength} characters.`
      : "No title tag was found."
  });
  checks.push({
    category: "content",
    label: "Meta description",
    status:
      descriptionLength >= 70 && descriptionLength <= 160
        ? "pass"
        : descriptionLength > 0
          ? "warn"
          : "fail",
    detail: descriptionLength
      ? `Meta description is ${descriptionLength} characters.`
      : "No meta description was found."
  });
  checks.push({
    category: "content",
    label: "H1 structure",
    status: input.h1.length === 1 ? "pass" : input.h1.length > 1 ? "warn" : "fail",
    detail:
      input.h1.length === 1
        ? `One H1 found: "${input.h1[0]}".`
        : `${input.h1.length} H1 tags were found.`
  });
  checks.push({
    category: "content",
    label: "Supporting headings",
    status: input.h2Count >= 2 ? "pass" : "warn",
    detail: `${input.h2Count} H2 headings were found.`
  });
  checks.push({
    category: "content",
    label: "Body depth",
    status:
      input.wordCount >= 500 ? "pass" : input.wordCount >= 250 ? "warn" : "fail",
    detail: `The visible body text has about ${input.wordCount} words.`
  });

  checks.push({
    category: "media",
    label: "Image alt text",
    status:
      input.images === 0 || input.imagesMissingAlt === 0
        ? "pass"
        : input.imagesMissingAlt <= Math.max(2, input.images * 0.15)
          ? "warn"
          : "fail",
    detail:
      input.images === 0
        ? "No images were found."
        : `${input.imagesMissingAlt} of ${input.images} images are missing alt text.`
  });

  checks.push({
    category: "links",
    label: "Internal links",
    status: input.internalLinks >= 3 ? "pass" : "warn",
    detail: `${input.internalLinks} internal links were found.`
  });
  checks.push({
    category: "links",
    label: "External references",
    status: input.externalLinks > 0 ? "pass" : "warn",
    detail: `${input.externalLinks} external links were found.`
  });

  checks.push({
    category: "social",
    label: "Open Graph",
    status: input.openGraphTags >= 3 ? "pass" : input.openGraphTags > 0 ? "warn" : "fail",
    detail: `${input.openGraphTags} Open Graph tags were found.`
  });
  checks.push({
    category: "social",
    label: "Twitter cards",
    status: input.twitterTags >= 2 ? "pass" : input.twitterTags > 0 ? "warn" : "fail",
    detail: `${input.twitterTags} Twitter card tags were found.`
  });

  return checks;
}

function calculateScores(checks: SeoCheck[]) {
  const categories = ["content", "technical", "links", "media", "social"] as const;
  const scores = Object.fromEntries(
    categories.map((category) => [category, scoreCategory(checks, category)])
  ) as Record<(typeof categories)[number], number>;

  const overall = Math.round(
    scores.content * 0.3 +
      scores.technical * 0.35 +
      scores.links * 0.1 +
      scores.media * 0.1 +
      scores.social * 0.15
  );

  return { overall, ...scores };
}

function scoreCategory(checks: SeoCheck[], category: SeoCheck["category"]) {
  const categoryChecks = checks.filter((check) => check.category === category);
  if (categoryChecks.length === 0) return 100;

  const points = categoryChecks.reduce((sum, check) => {
    if (check.status === "pass") return sum + 1;
    if (check.status === "warn") return sum + 0.55;
    return sum;
  }, 0);

  return Math.round((points / categoryChecks.length) * 100);
}

function buildRecommendations(
  checks: SeoCheck[],
  facts: {
    title: string;
    description: string;
    h1Count: number;
    imagesMissingAlt: number;
    wordCount: number;
    hasNoindex: boolean;
    responseMs: number;
  }
): SeoRecommendation[] {
  const recommendations: SeoRecommendation[] = [];
  const failedOrWarned = checks.filter((check) => check.status !== "pass");

  if (facts.hasNoindex) {
    recommendations.push({
      priority: "high",
      title: "Remove noindex if this page should rank",
      detail:
        "Search engines are being told not to index this page. Remove the noindex directive unless this is intentional."
    });
  }

  if (!facts.title || facts.title.length < 30 || facts.title.length > 60) {
    recommendations.push({
      priority: facts.title ? "medium" : "high",
      title: "Rewrite the title tag",
      detail:
        "Use a unique, search-focused title around 30-60 characters that includes the primary topic and brand when useful."
    });
  }

  if (
    !facts.description ||
    facts.description.length < 70 ||
    facts.description.length > 160
  ) {
    recommendations.push({
      priority: facts.description ? "medium" : "high",
      title: "Improve the meta description",
      detail:
        "Write a clear summary around 70-160 characters. It does not directly rank the page, but it strongly affects click-through."
    });
  }

  if (facts.h1Count !== 1) {
    recommendations.push({
      priority: "high",
      title: "Fix the H1 structure",
      detail:
        "Use one descriptive H1 that matches the page intent. Move secondary section titles to H2 or H3 headings."
    });
  }

  if (facts.wordCount < 500) {
    recommendations.push({
      priority: facts.wordCount < 250 ? "high" : "medium",
      title: "Add more useful body content",
      detail:
        "Expand the page with original explanations, examples, FAQs, comparisons, or proof points that satisfy the search intent."
    });
  }

  if (facts.imagesMissingAlt > 0) {
    recommendations.push({
      priority: "medium",
      title: "Add descriptive alt text",
      detail:
        "Give meaningful images concise alt text. Leave decorative images empty only when they add no content."
    });
  }

  if (facts.responseMs > 2500) {
    recommendations.push({
      priority: "medium",
      title: "Reduce server response time",
      detail:
        "Cache HTML, reduce blocking backend work, and check hosting latency. Slow HTML responses delay every downstream render step."
    });
  }

  for (const check of failedOrWarned) {
    if (recommendations.length >= 8) break;
    if (
      recommendations.some((recommendation) =>
        recommendation.title.toLowerCase().includes(check.label.toLowerCase())
      )
    ) {
      continue;
    }
    recommendations.push({
      priority: check.status === "fail" ? "high" : "low",
      title: `Address ${check.label.toLowerCase()}`,
      detail: check.detail
    });
  }

  return recommendations.slice(0, 8);
}

function parseCharset(contentType: string) {
  return /charset=([^;]+)/i.exec(contentType)?.[1]?.trim();
}

function resolveMaybeUrl(value: string, baseUrl: URL) {
  if (!value.trim()) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function countWords(value: string) {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.length ?? 0;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}
