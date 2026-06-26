import { describe, expect, it } from "vitest"
import {
  ONBOARDING_REPO_PREFIX,
  emailHash,
  generateInviteToken,
  isReconcilableRow,
  isValidEmail,
  isValidInviteToken,
  normalizeEmail,
  onboardingRepoCandidates,
  onboardingRepoName,
  onboardingRepoNameByGithubId,
  onboardingRepoNameByToken,
  onboardingRepoNameFromHash,
  payloadEmailMatchesRow,
  reconcileRowKey,
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

  it("puts the token candidate first when present", () => {
    const token = "a".repeat(32)
    const candidates = onboardingRepoCandidates({
      invite_token: token,
      github_id: "583231",
      email_hash: "abc123",
    })
    expect(candidates[0]).toBe(onboardingRepoNameByToken(token))
    expect(candidates).toHaveLength(3)
  })

  it("returns nothing for a row with neither key", () => {
    expect(onboardingRepoCandidates({})).toEqual([])
  })
})

describe("generateInviteToken / isValidInviteToken", () => {
  it("generates a 32-char lowercase-hex token that validates", () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(isValidInviteToken(token)).toBe(true)
  })

  it("generates distinct tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken())
  })

  it("rejects malformed tokens", () => {
    expect(isValidInviteToken("")).toBe(false)
    expect(isValidInviteToken("xyz")).toBe(false)
    expect(isValidInviteToken("A".repeat(32))).toBe(false)
    expect(isValidInviteToken("a".repeat(31))).toBe(false)
  })
})

describe("onboardingRepoNameByToken", () => {
  it("composes the prefix with a tok- segment", () => {
    const token = "b".repeat(32)
    expect(onboardingRepoNameByToken(token)).toBe(
      `${ONBOARDING_REPO_PREFIX}tok-${token}`,
    )
  })
})

describe("reconcileRowKey", () => {
  it("prefers github_id", () => {
    expect(reconcileRowKey({ github_id: "123", email_hash: "abc" })).toBe(
      "id:123",
    )
  })

  it("falls back to email_hash", () => {
    expect(reconcileRowKey({ email_hash: "abc" })).toBe("email:abc")
  })

  it("is undefined when the row has no key", () => {
    expect(reconcileRowKey({})).toBeUndefined()
  })
})

describe("isReconcilableRow", () => {
  it("is true for an unreconciled row with a key", () => {
    expect(isReconcilableRow({ email_hash: "abc" })).toBe(true)
    expect(isReconcilableRow({ github_id: "123" })).toBe(true)
  })

  it("is false once reconciled", () => {
    expect(
      isReconcilableRow({ enrollment_status: "reconciled", github_id: "123" }),
    ).toBe(false)
  })

  it("is false with no key to look up by", () => {
    expect(isReconcilableRow({ enrollment_status: "invited" })).toBe(false)
  })
})

describe("payloadEmailMatchesRow (P0 hijack guard)", () => {
  it("accepts a payload email that hashes to the row's email_hash", async () => {
    const email = "victim@uni.edu"
    const hash = await emailHash(email)
    expect(await payloadEmailMatchesRow(email, { email_hash: hash })).toBe(true)
  })

  it("rejects a self-report for a DIFFERENT email than the invited row", async () => {
    const invitedHash = await emailHash("victim@uni.edu")
    expect(
      await payloadEmailMatchesRow("attacker@evil.com", {
        email_hash: invitedHash,
      }),
    ).toBe(false)
  })

  it("matches case-insensitively against a row that only has email", async () => {
    expect(
      await payloadEmailMatchesRow("Victim@Uni.edu", {
        email: "victim@uni.edu",
      }),
    ).toBe(true)
  })

  it("falls through (true) for a github_id row with no email on file", async () => {
    expect(await payloadEmailMatchesRow("anything@uni.edu", {})).toBe(true)
  })
})
