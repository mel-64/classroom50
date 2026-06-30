import { describe, expect, it, vi } from "vitest"

import {
  buildReusedEntry,
  editAssignment,
  nextAvailableSlug,
  preserveUnmanagedAssignmentKeys,
} from "./assignments"
import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { Assignment } from "@/types/classroom"

const fullSource: Assignment = {
  slug: "hw1",
  name: "Homework 1",
  description: "Intro problem set",
  mode: "individual",
  autograder: "default",
  feedback_pr: true,
  template: { owner: "acme", repo: "hw1-starter", branch: "main" },
  due: "2026-09-01T23:59:00Z",
  due_meta: {
    input: "2026-09-01 23:59",
    offset: "+00:00",
    source: "explicit-offset",
  },
  max_group_size: 3,
  runtime: { "runs-on": "ubuntu-latest", container: { image: "python:3.12" } },
  allowed_files: ["src/*.py", "!src/secret.py"],
  pass_threshold: 80,
  tests: [{ type: "run", name: "build", run: "make", points: 10 }],
}

describe("buildReusedEntry", () => {
  it("copies every field verbatim, overriding only slug and name", () => {
    const entry = buildReusedEntry(fullSource, {
      slug: "hw1-fall",
      name: "Homework 1 (Fall)",
    })

    expect(entry).toEqual({
      ...fullSource,
      slug: "hw1-fall",
      name: "Homework 1 (Fall)",
    })
  })

  it("deep-copies nested objects and arrays (no shared references)", () => {
    const entry = buildReusedEntry(fullSource, {
      slug: "hw1",
      name: "Homework 1",
    })

    expect(entry.template).not.toBe(fullSource.template)
    expect(entry.due_meta).not.toBe(fullSource.due_meta)
    expect(entry.runtime).not.toBe(fullSource.runtime)
    expect(entry.runtime?.container).not.toBe(fullSource.runtime?.container)
    expect(entry.allowed_files).not.toBe(fullSource.allowed_files)
    expect(entry.tests).not.toBe(fullSource.tests)
    expect(entry.tests?.[0]).not.toBe(fullSource.tests?.[0])

    // Mutating the copy must not leak back into the source.
    entry.allowed_files?.push("extra")
    entry.tests?.push({ type: "run", name: "x", run: "x", points: 0 })
    expect(fullSource.allowed_files).toHaveLength(2)
    expect(fullSource.tests).toHaveLength(1)
  })

  it("trims the slug and name overrides", () => {
    const entry = buildReusedEntry(fullSource, {
      slug: "  hw1-fall  ",
      name: "  Homework 1  ",
    })
    expect(entry.slug).toBe("hw1-fall")
    expect(entry.name).toBe("Homework 1")
  })

  it("defaults to the source slug/name when overrides match them", () => {
    const entry = buildReusedEntry(fullSource, {
      slug: fullSource.slug,
      name: fullSource.name,
    })
    expect(entry.slug).toBe("hw1")
    expect(entry.name).toBe("Homework 1")
  })

  it("throws when the slug is blank", () => {
    expect(() =>
      buildReusedEntry(fullSource, { slug: "   ", name: "Homework 1" }),
    ).toThrow(/slug is required/i)
  })

  it("omits absent optional fields rather than writing them as undefined", () => {
    const minimal: Assignment = {
      slug: "bare",
      name: "Bare",
      mode: "individual",
      autograder: "default",
    }
    const entry = buildReusedEntry(minimal, { slug: "bare2", name: "Bare 2" })

    // Keys that resolve to undefined must not be present (omitempty-clean for
    // the strict CLI parser).
    expect("template" in entry).toBe(false)
    expect("due_meta" in entry).toBe(false)
    expect("runtime" in entry).toBe(false)
    expect("allowed_files" in entry).toBe(false)
    expect("tests" in entry).toBe(false)
    expect(entry).toEqual({
      slug: "bare2",
      name: "Bare 2",
      mode: "individual",
      autograder: "default",
    })
  })

  it("drops an empty runtime.container while keeping runtime", () => {
    const source: Assignment = {
      slug: "rt",
      name: "Runtime only",
      mode: "individual",
      autograder: "default",
      runtime: { "runs-on": "ubuntu-latest" },
    }
    const entry = buildReusedEntry(source, { slug: "rt2", name: "Runtime 2" })
    expect(entry.runtime).toEqual({ "runs-on": "ubuntu-latest" })
    expect("container" in (entry.runtime ?? {})).toBe(false)
  })

  it("preserves a pass_threshold of 0 (falsy but meaningful)", () => {
    const source: Assignment = {
      slug: "z",
      name: "Zero",
      mode: "individual",
      autograder: "default",
      pass_threshold: 0,
    }
    const entry = buildReusedEntry(source, { slug: "z2", name: "Zero 2" })
    expect(entry.pass_threshold).toBe(0)
  })

  it("preserves an empty tests/allowed_files array (present, not dropped)", () => {
    // An empty array is truthy, so the omitempty cleanup must NOT delete it —
    // absent vs [] can mean different things to the CLI, so reuse copies the
    // source's choice verbatim.
    const source: Assignment = {
      slug: "e",
      name: "Empties",
      mode: "individual",
      autograder: "default",
      tests: [],
      allowed_files: [],
    }
    const entry = buildReusedEntry(source, { slug: "e2", name: "Empties 2" })
    expect(entry.tests).toEqual([])
    expect(entry.allowed_files).toEqual([])
  })

  it("copies a runtime with a container but no runs-on", () => {
    const source: Assignment = {
      slug: "c",
      name: "Container only",
      mode: "individual",
      autograder: "default",
      runtime: { container: { image: "node:22" } },
    }
    const entry = buildReusedEntry(source, { slug: "c2", name: "Container 2" })
    expect(entry.runtime).toEqual({ container: { image: "node:22" } })
  })
})

describe("preserveUnmanagedAssignmentKeys", () => {
  it("carries forward migrated_from from the existing entry", () => {
    const existing: Assignment = {
      ...fullSource,
      migrated_from: {
        source: "github-classroom",
        classroom_id: 42,
        assignment_id: 7,
        original_slug: "hw1-old",
        migrated_at: "2026-01-02T03:04:05Z",
      },
    }
    // A fresh form rebuild drops migrated_from.
    const edited: Assignment = {
      slug: "hw1",
      name: "Homework 1 (edited)",
      mode: "individual",
      autograder: "default",
    }
    const merged = preserveUnmanagedAssignmentKeys(existing, edited)
    expect(merged.migrated_from).toEqual(existing.migrated_from)
    expect(merged.name).toBe("Homework 1 (edited)")
  })

  it("preserves unknown future keys but never overwrites managed ones", () => {
    const existing = {
      slug: "hw1",
      name: "Old name",
      mode: "individual",
      autograder: "default",
      // Unknown key from a newer binary.
      experimental_flag: { enabled: true },
      // Stale managed key the edit changes below.
      pass_threshold: 50,
    } as unknown as Assignment
    const edited: Assignment = {
      slug: "hw1",
      name: "New name",
      mode: "individual",
      autograder: "default",
      pass_threshold: 90,
    }
    const merged = preserveUnmanagedAssignmentKeys(existing, edited) as Record<
      string,
      unknown
    >
    expect(merged.experimental_flag).toEqual({ enabled: true })
    expect(merged.pass_threshold).toBe(90)
    expect(merged.name).toBe("New name")
  })

  it("does not re-add a managed key the edit deliberately cleared", () => {
    const existing: Assignment = { ...fullSource, due: "2026-09-01T23:59:00Z" }
    // Edit removed the due date (omitted from the rebuilt entry).
    const edited: Assignment = {
      slug: "hw1",
      name: "Homework 1",
      mode: "individual",
      autograder: "default",
    }
    const merged = preserveUnmanagedAssignmentKeys(existing, edited)
    expect(merged.due).toBeUndefined()
  })
})

describe("nextAvailableSlug", () => {
  it("returns the base unchanged when it is free", () => {
    expect(nextAvailableSlug("hw1", ["hw2", "hw3"])).toBe("hw1")
    expect(nextAvailableSlug("hw1", [])).toBe("hw1")
  })

  it("suffixes -2 when the base is taken", () => {
    expect(nextAvailableSlug("hw1", ["hw1"])).toBe("hw1-2")
  })

  it("skips taken suffixes until it finds a free one", () => {
    expect(nextAvailableSlug("hw1", ["hw1", "hw1-2", "hw1-3"])).toBe("hw1-4")
  })

  it("increments a base that already ends in -<n> instead of stacking", () => {
    expect(nextAvailableSlug("hw1-2", ["hw1-2"])).toBe("hw1-3")
    expect(nextAvailableSlug("hw1-2", ["hw1-2", "hw1-3"])).toBe("hw1-4")
  })

  it("treats a base ending in -<n> as free when nothing collides", () => {
    expect(nextAvailableSlug("hw1-2", ["hw1"])).toBe("hw1-2")
  })

  it("matches taken slugs case-insensitively", () => {
    expect(nextAvailableSlug("HW1", ["hw1"])).toBe("HW1-2")
    expect(nextAvailableSlug("hw1", ["HW1", "Hw1-2"])).toBe("hw1-3")
  })

  it("splits only the trailing -<n> on a stem with internal hyphens", () => {
    // "hw-1-2" -> stem "hw-1", n=3 (not "hw" / "hw-1-2-2").
    expect(nextAvailableSlug("hw-1-2", ["hw-1-2"])).toBe("hw-1-3")
  })
})

describe("editAssignment (preserved-entry integration)", () => {
  const ORG = "acme"
  const CLASSROOM = "cs50"
  const SLUG = "hw1"

  // The CLI-authored entry the GUI is about to edit: carries a CLI-only
  // migrated_from block (the form never manages it) and a managed `due` the
  // edit clears.
  const existingEntry: Assignment = {
    slug: SLUG,
    name: "Homework 1",
    mode: "individual",
    autograder: "default",
    feedback_pr: true,
    due: "2026-09-01T23:59:00Z",
    migrated_from: {
      source: "github-classroom",
      classroom_id: 42,
      assignment_id: 7,
      original_slug: "hw1-old",
      migrated_at: "2026-01-02T03:04:05Z",
    },
  }

  // Wire up a route-table GitHubClient covering exactly the endpoints
  // editAssignment hits on the template-less path: ref read, commit read,
  // assignments.json contents read, then tree/commit/ref writes. classroom.json
  // is absent (404) so the archive guard reads the classroom as active.
  function makeClient(): {
    client: GitHubClient
    committedContent: () => string
  } {
    const assignmentsFile = {
      schema: "classroom50/assignments/v1",
      assignments: [existingEntry],
    }
    const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64")

    let committedContent = ""

    const request = vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? "GET"
      if (method === "GET" && url.includes("/git/ref/heads/main")) {
        return { object: { sha: "refsha" } }
      }
      if (method === "GET" && url.includes("/git/commits/refsha")) {
        return { tree: { sha: "basetree" } }
      }
      if (method === "GET" && url.includes("/contents/cs50/assignments.json")) {
        return {
          type: "file",
          encoding: "base64",
          content: b64(JSON.stringify(assignmentsFile)),
        }
      }
      if (method === "POST" && url.endsWith("/git/trees")) {
        const body = (init as { body?: { tree: { content: string }[] } }).body
        committedContent = body!.tree[0].content
        return { sha: "newtree" }
      }
      if (method === "POST" && url.endsWith("/git/commits")) {
        return { sha: "newcommit" }
      }
      if (method === "PATCH" && url.includes("/git/refs/heads/main")) {
        return { object: { sha: "newcommit" } }
      }
      throw new Error(`unexpected request: ${method} ${url}`)
    })

    // classroom.json read (archive guard): 404 -> treated as active.
    const requestRaw = vi.fn(async () => {
      throw new GitHubAPIError({
        status: 404,
        url: "classroom.json",
        message: "Not Found",
        body: null,
        rateLimit: {
          limit: null,
          remaining: null,
          used: null,
          reset: null,
          resource: null,
          retryAfter: null,
        },
      })
    })

    return {
      client: { request, requestRaw } as unknown as GitHubClient,
      committedContent: () => committedContent,
    }
  }

  function editInput(overrides: Partial<Record<string, unknown>> = {}) {
    // The form rebuilds only the fields it manages; this renames the
    // assignment and clears the due date (omitted from the rebuilt entry).
    return {
      org: ORG,
      classroom: CLASSROOM,
      slug: SLUG,
      name: "Homework 1 (edited)",
      description: "",
      template_repo: "",
      due_date: "",
      mode: "individual",
      max_group_size: 0,
      tests: [],
      ...overrides,
    } as unknown as Parameters<typeof editAssignment>[1]
  }

  it("preserves migrated_from, applies the rename, and drops the cleared due", async () => {
    const { client, committedContent } = makeClient()

    await editAssignment(client, editInput())

    const written = JSON.parse(committedContent()) as {
      assignments: Assignment[]
    }
    const edited = written.assignments.find((a) => a.slug === SLUG)!

    // Unmanaged CLI field rides through the read-modify-write.
    expect(edited.migrated_from).toEqual(existingEntry.migrated_from)
    // Managed edit wins.
    expect(edited.name).toBe("Homework 1 (edited)")
    // Cleared managed key is not resurrected from the stale existing entry.
    expect(edited.due).toBeUndefined()
  })
})
