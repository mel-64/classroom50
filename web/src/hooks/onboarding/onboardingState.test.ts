import { describe, expect, it } from "vitest"
import {
  deriveOnboardingState,
  type OnboardingStateInput,
} from "./onboardingState"

const base: OnboardingStateInput = {
  loadingMembership: false,
  loadingDependents: false,
  hasMembership: true,
  justSubmitted: false,
  hasOnboarded: false,
  onClassroomTeam: false,
}

describe("deriveOnboardingState", () => {
  it("is loading while membership is resolving", () => {
    expect(deriveOnboardingState({ ...base, loadingMembership: true })).toBe(
      "loading",
    )
  })

  it("is loading while dependents load once a membership exists", () => {
    expect(
      deriveOnboardingState({
        ...base,
        hasMembership: true,
        loadingDependents: true,
      }),
    ).toBe("loading")
  })

  it("does NOT wait on dependents when there is no membership", () => {
    // No membership + dependents still 'loading' should resolve to notInvited,
    // not spin — the dependent probes are disabled without a membership anyway.
    expect(
      deriveOnboardingState({
        ...base,
        hasMembership: false,
        loadingDependents: true,
      }),
    ).toBe("notInvited")
  })

  it("is notInvited without a membership record", () => {
    expect(deriveOnboardingState({ ...base, hasMembership: false })).toBe(
      "notInvited",
    )
  })

  it("is pendingConfirmation right after a submit", () => {
    expect(deriveOnboardingState({ ...base, justSubmitted: true })).toBe(
      "pendingConfirmation",
    )
  })

  it("is pendingConfirmation when an onboarding repo already exists", () => {
    expect(deriveOnboardingState({ ...base, hasOnboarded: true })).toBe(
      "pendingConfirmation",
    )
  })

  it("prefers pendingConfirmation over allSet after a fresh submit", () => {
    expect(
      deriveOnboardingState({
        ...base,
        justSubmitted: true,
        onClassroomTeam: true,
      }),
    ).toBe("pendingConfirmation")
  })

  it("is allSet when on the classroom team and nothing pending", () => {
    expect(deriveOnboardingState({ ...base, onClassroomTeam: true })).toBe(
      "allSet",
    )
  })

  it("falls through to the form otherwise", () => {
    expect(deriveOnboardingState(base)).toBe("form")
  })
})
