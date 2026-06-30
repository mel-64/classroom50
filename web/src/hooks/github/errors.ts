export type GitHubRateLimit = {
  limit: number | null
  remaining: number | null
  used: number | null
  reset: number | null
  resource: string | null
  retryAfter: number | null
}

export class GitHubAPIError extends Error {
  status: number
  url: string
  body: unknown
  rateLimit: GitHubRateLimit

  constructor(args: {
    status: number
    url: string
    message: string
    body: unknown
    rateLimit: GitHubRateLimit
  }) {
    super(args.message)
    this.name = "GitHubAPIError"
    this.status = args.status
    this.url = args.url
    this.body = args.body
    this.rateLimit = args.rateLimit
  }

  get isNotFound() {
    return this.status === 404
  }

  get isForbidden() {
    return this.status === 403
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isRateLimited() {
    return (
      this.status === 429 ||
      (this.status === 403 &&
        (this.rateLimit.remaining === 0 || this.rateLimit.retryAfter !== null))
    )
  }
}

// Shared React Query `retry` predicate for fail-closed role/permission reads: a
// 404 (not found / not a member) or 403 (blocked) is DEFINITIVE and must NOT
// retry, while a transient 5xx/429/network blip self-heals (bounded to 2).
export function retryTransientNotFoundForbidden(
  failureCount: number,
  error: unknown,
): boolean {
  if (
    error instanceof GitHubAPIError &&
    (error.status === 404 || error.status === 403)
  ) {
    return false
  }
  return failureCount < 2
}

export function readGitHubRateLimitHeaders(res: Response): GitHubRateLimit {
  const numberHeader = (name: string) => {
    const value = res.headers.get(name)
    return value === null ? null : Number(value)
  }

  return {
    limit: numberHeader("x-ratelimit-limit"),
    remaining: numberHeader("x-ratelimit-remaining"),
    used: numberHeader("x-ratelimit-used"),
    reset: numberHeader("x-ratelimit-reset"),
    resource: res.headers.get("x-ratelimit-resource"),
    retryAfter: numberHeader("retry-after"),
  }
}
