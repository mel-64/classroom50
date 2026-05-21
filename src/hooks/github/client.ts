import { GitHubAPIError, readGitHubRateLimitHeaders } from "./errors"

export type GitHubClient = {
  request: <T = unknown>(
    path: string,
    options?: GitHubRequestOptions,
  ) => Promise<T>

  requestRaw: (path: string, options?: GitHubRequestOptions) => Promise<string>
}

export type GitHubRequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  accept?: string
  signal?: AbortSignal
  headers?: Record<string, string>
}

export function createGitHubClient(args: {
  token: string
  apiBaseUrl?: string
}): GitHubClient {
  const apiBaseUrl = args.apiBaseUrl ?? "https://api.github.com"

  async function requestInternal(
    path: string,
    options: GitHubRequestOptions = {},
  ): Promise<Response> {
    const url = path.startsWith("http")
      ? path
      : `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${args.token}`,
      Accept: options.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      ...options.headers,
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })

    if (!res.ok) {
      const rateLimit = readGitHubRateLimitHeaders(res)

      let body: unknown = null
      const text = await res.text()

      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }

      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : `GitHub API request failed with ${res.status}`

      throw new GitHubAPIError({
        status: res.status,
        url,
        message,
        body,
        rateLimit,
      })
    }

    return res
  }

  return {
    async request<T>(path, options) {
      const res = await requestInternal(path, options)
      return (await res.json()) as T
    },

    async requestRaw(path, options) {
      const res = await requestInternal(path, {
        ...options,
        accept: options?.accept ?? "application/vnd.github.raw+json",
      })

      return await res.text()
    },
  }
}
