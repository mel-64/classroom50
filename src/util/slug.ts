// Normalize a free-text value into a URL/repo-safe slug: lowercase, punctuation
// stripped, runs of non-alphanumerics collapsed to single hyphens, no leading/
// trailing hyphens. Used for classroom and assignment slugs (which become
// GitHub repo path segments), so it must stay deterministic and lossless on
// already-slugified input.
export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
