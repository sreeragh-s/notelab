import { isAllowedHttpUrl, isAllowedImageUrl, parseAbsoluteUrl } from "./safe-url"
import type { ClipMetadata } from "./types"

export type { ClipMetadata } from "./types"

export function extractClipMetadata(document: Document, pageUrl: string): ClipMetadata {
  const url = parseAbsoluteUrl(pageUrl)
  const canonical = absoluteFrom(
    document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    pageUrl,
  )
  const title =
    metaContent(document, "og:title") ??
    metaContent(document, "twitter:title") ??
    document.querySelector("title")?.textContent?.trim() ??
    url?.hostname ??
    pageUrl
  const description =
    metaContent(document, "og:description") ??
    metaContent(document, "twitter:description") ??
    namedMeta(document, "description")
  const image = firstAllowedImage(
    metaContent(document, "og:image"),
    metaContent(document, "twitter:image"),
    pageUrl,
  )
  const favicon = firstAllowedHttp(
    document.querySelector('link[rel="icon"]')?.getAttribute("href"),
    document.querySelector('link[rel="shortcut icon"]')?.getAttribute("href"),
    document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    pageUrl,
  )
  const site = metaContent(document, "og:site_name")
  const author =
    namedMeta(document, "author") ??
    jsonLdString(document, "author") ??
    jsonLdString(document, "creator")
  const published =
    metaContent(document, "article:published_time") ??
    namedMeta(document, "date") ??
    jsonLdString(document, "datePublished")
  const schemaType = jsonLdType(document)
  const selectionText = document.getSelection?.()?.toString().trim() || null
  const text = document.body?.textContent?.replace(/\s+/g, " ").trim() ?? ""

  return {
    author,
    canonicalUrl: canonical,
    description,
    domain: url?.hostname ?? "",
    favicon,
    image,
    published,
    schemaType,
    selectionText,
    site,
    title,
    url: pageUrl,
    wordCount: text ? text.split(" ").filter(Boolean).length : 0,
  }
}

function metaContent(document: Document, property: string) {
  return (
    document
      .querySelector(`meta[property="${property}"]`)
      ?.getAttribute("content")
      ?.trim() ||
    document.querySelector(`meta[name="${property}"]`)?.getAttribute("content")?.trim() ||
    null
  )
}

function namedMeta(document: Document, name: string) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || null
}

function jsonLdString(document: Document, key: string) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "")
      const value = readJsonLd(data, key)
      if (typeof value === "string" && value.trim()) return value.trim()
      if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
        return value.name
      }
    } catch {
      continue
    }
  }
  return null
}

function jsonLdType(document: Document) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "")
      const type = readJsonLd(data, "@type")
      if (typeof type === "string") return type
    } catch {
      continue
    }
  }
  return null
}

function readJsonLd(data: unknown, key: string): unknown {
  if (Array.isArray(data)) {
    for (const item of data) {
      const value = readJsonLd(item, key)
      if (value) return value
    }
    return null
  }
  if (data && typeof data === "object" && key in data) {
    return (data as Record<string, unknown>)[key]
  }
  if (data && typeof data === "object" && "@graph" in data) {
    return readJsonLd((data as { "@graph": unknown })["@graph"], key)
  }
  return null
}

function absoluteFrom(value: string | null | undefined, base: string) {
  if (!value) return null
  try {
    const url = new URL(value, base).toString()
    return isAllowedHttpUrl(url) ? url : null
  } catch {
    return null
  }
}

function firstAllowedHttp(...values: Array<string | null | undefined>) {
  const base = values.at(-1) ?? ""
  for (const value of values.slice(0, -1)) {
    const url = absoluteFrom(value, base)
    if (url) return url
  }
  return null
}

function firstAllowedImage(...values: Array<string | null | undefined>) {
  const base = values.at(-1) ?? ""
  for (const value of values.slice(0, -1)) {
    const url = absoluteFrom(value, base)
    if (url && isAllowedImageUrl(url)) return url
  }
  return null
}
