import { describe, expect, it } from "vitest"
import {
  ONBOARDING_REPO_PREFIX,
  emailHash,
  isValidEmail,
  normalizeEmail,
  onboardingRepoCandidates,
  onboardingRepoName,
  onboardingRepoNameByGithubId,
  onboardingRepoNameFromHash,
} from "./onboarding"

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com")
  })

  it("does NOT strip +tags or dots (distinct addresses stay distinct)", () => {
    expect(normalizeEmail("a+tag@gmail.com")).toBe("a+tag@gmail.com")
    expect(normalizeEmail("a.b@gmail.com")).toBe("a.b@gmail.com")
  })
})

describe("emailHash", () => {
  it("is deterministic for the same normalized email", async () => {
    const a = await emailHash("rongxinliu.g@gmail.com")
    const b = await emailHash("  RongXinLiu.G@Gmail.com  ")
    expect(a).toBe(b)
  })

  it("returns 16 lowercase hex chars", async () => {
    const h = await emailHash("student@uni.edu")
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it("does not collide on punctuation-distinct emails", async () => {
    const dot = await emailHash("rongxinliu.g@gmail.com")
    const dash = await emailHash("rongxinliu-g@gmail.com")
    expect(dot).not.toBe(dash)
  })
})

describe("onboardingRepoName", () => {
  it("composes the prefix with the hash", async () => {
    const email = "student@uni.edu"
    const hash = await emailHash(email)
    expect(await onboardingRepoName(email)).toBe(
      `${ONBOARDING_REPO_PREFIX}${hash}`,
    )
  })

  it("matches onboardingRepoNameFromHash for the same email", async () => {
    const email = "student@uni.edu"
    const hash = await emailHash(email)
    expect(await onboardingRepoName(email)).toBe(
      onboardingRepoNameFromHash(hash),
    )
  })
})

describe("isValidEmail", () => {
  it("accepts a typical address", () => {
    expect(isValidEmail("student@university.edu")).toBe(true)
    expect(isValidEmail("  a+tag@gmail.com  ")).toBe(true)
  })

  it("rejects obvious non-emails", () => {
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("nope")).toBe(false)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("a @b.com")).toBe(false)
  })
})

describe("onboardingRepoCandidates", () => {
  it("includes the github-id name when github_id is present", () => {
    expect(onboardingRepoCandidates({ github_id: "583231" })).toEqual([
      onboardingRepoNameByGithubId("583231"),
    ])
  })

  it("includes the email-hash name when only email_hash is present", () => {
    expect(onboardingRepoCandidates({ email_hash: "abc123" })).toEqual([
      onboardingRepoNameFromHash("abc123"),
    ])
  })

  it("returns both candidates (deduped) when the row has both", () => {
    const candidates = onboardingRepoCandidates({
      github_id: "583231",
      email_hash: "abc123",
    })
    expect(candidates).toContain(onboardingRepoNameByGithubId("583231"))
    expect(candidates).toContain(onboardingRepoNameFromHash("abc123"))
    expect(candidates).toHaveLength(2)
  })

  it("returns nothing for a row with neither key", () => {
    expect(onboardingRepoCandidates({})).toEqual([])
  })
})
