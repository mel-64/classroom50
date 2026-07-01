import { useQuery } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"
import {
  hasActiveOnboardingForClassroom,
  isTeamMember,
} from "@/hooks/github/queries"
import { classroomTeamSlugHeuristic } from "@/util/onboarding"
import {
  deriveOnboardingState,
  type OnboardingState,
} from "@/hooks/onboarding/onboardingState"

// Runs the three signals (own org membership, whether an onboarding repo exists
// for this classroom, classroom-team membership) and folds them through the pure
// deriveOnboardingState. `justSubmitted` (from the page's mutation) shows pending
// immediately. Keeps the query wiring out of OnboardingPage.
export function useOnboardingState(input: {
  org?: string
  classroom?: string
  justSubmitted: boolean
}): OnboardingState {
  const { org, classroom, justSubmitted } = input
  const client = useGitHubClient()
  const { user } = useGithubAuth()

  const { data: orgMembership, isLoading: loadingMembership } =
    useGetOwnOrgMembership(org)

  // Repo-based "submitted" detection that survives reload: an onboarding repo
  // for this classroom exists (awaiting the teacher's reconcile). Gated on
  // having a membership so it only runs once we know the student was invited.
  const { data: hasOnboarded, isLoading: loadingOnboarded } = useQuery({
    queryKey: ["github", "onboarding-progress", org, classroom, user?.id],
    queryFn: () =>
      hasActiveOnboardingForClassroom(
        client,
        org ?? "",
        user?.id ?? "",
        classroom ?? "",
      ),
    enabled: Boolean(org && classroom && user?.id && orgMembership),
  })

  // "Has access" signal: active classroom-team membership (means "can work
  // here", NOT fully enrolled). The team slug is the student-side heuristic
  // (classroomTeamSlugHeuristic); a collision degrades safely to the form.
  const teamSlug = classroomTeamSlugHeuristic(classroom ?? "")
  const { data: onClassroomTeam, isLoading: loadingTeam } = useQuery({
    queryKey: ["github", "team-membership", org, teamSlug, user?.login],
    queryFn: () => isTeamMember(client, org ?? "", teamSlug, user?.login ?? ""),
    enabled: Boolean(org && user?.login && orgMembership),
  })

  return deriveOnboardingState({
    loadingMembership,
    loadingDependents: loadingOnboarded || loadingTeam,
    hasMembership: Boolean(orgMembership),
    justSubmitted,
    hasOnboarded: Boolean(hasOnboarded),
    onClassroomTeam: Boolean(onClassroomTeam),
  })
}
