import { describe, expect, it } from "vitest"

import { buildReusedEntry, nextAvailableSlug } from "./assignments"
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
