import { describe, expect, it } from "vitest"
import { pagesAssignmentUrl, classroomsIndexUrl } from "./queries"

describe("pagesAssignmentUrl", () => {
  it("builds the plain classroom path when no secret is set", () => {
    expect(pagesAssignmentUrl("acme", "cs50")).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
  })

  it("treats an empty/undefined secret as the plain path", () => {
    expect(pagesAssignmentUrl("acme", "cs50", "")).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
    expect(pagesAssignmentUrl("acme", "cs50", undefined)).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
  })

  it("inserts the capability-URL secret segment when present", () => {
    expect(pagesAssignmentUrl("acme", "cs50", "a1b2c3d4")).toBe(
      "https://acme.github.io/classroom50/cs50/a1b2c3d4/assignments.json",
    )
  })
})

describe("classroomsIndexUrl", () => {
  it("never carries a classroom or secret segment (public index)", () => {
    expect(classroomsIndexUrl("acme")).toBe(
      "https://acme.github.io/classroom50/classrooms-index.json",
    )
  })
})
