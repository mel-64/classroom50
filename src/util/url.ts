// Guards hrefs that originate from data the student (or any non-trusted source)
// can write — e.g. the `result.json` committed to their own repo's artifacts
// branch. A `javascript:`/`data:`/`vbscript:` URL rendered into an anchor href
// is a script-injection sink; only http(s) links are safe to render.

export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    // Not an absolute URL (or malformed). Reject — we only render absolute
    // http(s) links from untrusted result.json fields.
    return false
  }
}

// Returns the URL when it is a safe http(s) link, otherwise undefined so callers
// can omit the link rather than render an unsafe href.
export function safeHttpUrl(
  value: string | null | undefined,
): string | undefined {
  return isSafeHttpUrl(value) ? (value as string) : undefined
}
