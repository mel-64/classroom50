import { describe, expect, it } from "vitest"
import { resolveTeacherVerdict } from "./useCourseTeacherAccess"
import { GitHubAPIError } from "./github/errors"

const apiError = (status: number) =>
  new GitHubAPIError({
    status,
    url: "https://api.github.com/repos/acme/classroom50",
    message: `boom ${status}`,
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

const success = (
  permissions: Record<string, boolean>,
  org: string | undefined = "acme",
) =>
  resolveTeacherVerdict({
    org,
    isSuccess: true,
    permissions,
    error: null,
  })

const failure = (error: unknown, org: string | undefined = "acme") =>
  resolveTeacherVerdict({
    org,
    isSuccess: false,
    permissions: undefined,
    error,
  })

describe("resolveTeacherVerdict", () => {
  describe("success verdicts grant teacher UI on any non-trivial permission", () => {
    for (const perm of ["admin", "maintain", "push", "pull"]) {
      it(`treats ${perm} access as teacher`, () => {
        const v = success({ [perm]: true })
        expect(v.isTeacher).toBe(true)
        expect(v.showTeacherUi).toBe(true)
        expect(v.roleResolved).toBe(true)
        expect(v.isStudent).toBe(false)
        expect(v.isBlocked).toBe(false)
      })
    }

    it("does not grant teacher UI when the success carries no permissions", () => {
      const v = success({})
      expect(v.isTeacher).toBe(false)
      expect(v.showTeacherUi).toBe(false)
      // A success with no permissions is still a definitive (non-student) verdict.
      expect(v.roleResolved).toBe(true)
    })
  })

  describe("definitive error verdicts", () => {
    it("classifies a 404 as a resolved student, never teacher", () => {
      const v = failure(apiError(404))
      expect(v.isStudent).toBe(true)
      expect(v.isTeacher).toBe(false)
      expect(v.showTeacherUi).toBe(false)
      expect(v.roleResolved).toBe(true)
    })

    it("classifies a 403 as a resolved blocked user, never teacher", () => {
      const v = failure(apiError(403))
      expect(v.isBlocked).toBe(true)
      expect(v.isTeacher).toBe(false)
      expect(v.showTeacherUi).toBe(false)
      expect(v.roleResolved).toBe(true)
    })
  })

  describe("fail-closed on transient errors (the security core)", () => {
    for (const status of [500, 502, 503, 429]) {
      it(`leaves the role UNRESOLVED and teacher UI hidden on a ${status}`, () => {
        const v = failure(apiError(status))
        expect(v.roleResolved).toBe(false)
        expect(v.showTeacherUi).toBe(false)
        expect(v.isTeacher).toBe(false)
        expect(v.isStudent).toBe(false)
        expect(v.isBlocked).toBe(false)
      })
    }

    it("leaves the role unresolved on a non-API (network) error", () => {
      const v = failure(new Error("network down"))
      expect(v.roleResolved).toBe(false)
      expect(v.showTeacherUi).toBe(false)
    })
  })

  describe("org-less routes", () => {
    it("resolves immediately with no role and no teacher UI", () => {
      const v = resolveTeacherVerdict({
        org: undefined,
        isSuccess: false,
        permissions: undefined,
        error: null,
      })
      expect(v.roleResolved).toBe(true)
      expect(v.showTeacherUi).toBe(false)
      expect(v.isTeacher).toBe(false)
    })

    it("never shows teacher UI without an org even on a permissioned success", () => {
      const v = resolveTeacherVerdict({
        org: undefined,
        isSuccess: true,
        permissions: { admin: true },
        error: null,
      })
      expect(v.showTeacherUi).toBe(false)
      // isTeacher is still true (the permission is real); only the UI gate is
      // org-scoped, so an org-less route can't surface teacher UI.
      expect(v.isTeacher).toBe(true)
    })
  })
})
