import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  addRepoCollaborator,
  createCommitRepo,
  createTreeRepo,
  updateRefForRepo,
} from "@/hooks/github/mutations"
import {
  getBranchRefRepo,
  getCommitByRepo,
  isTeamMember,
  withFreshRepoRetry,
} from "@/hooks/github/queries"
import type { GitHubRepo } from "@/hooks/github/types"
import { getAuthenticatedUser } from "@/api/queries/users"
import { acceptPendingOrgInvite } from "@/api/mutations/users"
import {
  ONBOARDING_YAML_PATH,
  onboardingRepoName,
  onboardingRepoNameByGithubId,
  onboardingRepoNameByToken,
  isValidInviteToken,
  type OnboardingPayload,
} from "@/util/onboarding"
import { stringifyOnboardingYaml } from "@/util/yaml"

export type OnboardingResult = {
  status: "created" | "already-onboarded"
  repo: GitHubRepo
  repoName: string
  payload: OnboardingPayload
}

// Create the deterministically-named onboarding repo in the org and commit the
// self-report payload. The student is authenticated, so username/id come from
// GitHub (unforgeable). Idempotent: a re-run on an existing repo is treated as
// "already-onboarded" (the teacher reconcile reads whatever payload is present).
export async function submitOnboarding(
  client: GitHubClient,
  input: {
    org: string
    classroom: string
    email: string
    first_name: string
    last_name: string
    // Present only on the secure-link flow: the teacher-issued token that
    // names the onboarding repo unguessably. Absent on the classroom-wide link.
    invite_token?: string
  },
): Promise<OnboardingResult> {
  const { org, classroom, email, first_name, last_name } = input
  const inviteToken =
    input.invite_token && isValidInviteToken(input.invite_token)
      ? input.invite_token.trim()
      : undefined

  const user = await getAuthenticatedUser(client)

  // The membership gate accepts both "pending" and "active" invites, so a
  // student who hasn't accepted yet can reach here — and a pending invitee is
  // NOT a member, so the repo create below 403s ("need admin access to add a
  // repository"). Activate the invite with the student's own token first so
  // they're a real member before creating their onboarding repo. Best-effort:
  // if they're already active this is a no-op, and any genuine problem surfaces
  // on the repo create with a clearer message.
  await acceptPendingOrgInvite(client, org)

  const payload: OnboardingPayload = {
    email: email.trim(),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    github_username: user.login,
    github_id: user.id,
    classroom,
    created_at: new Date().toISOString(),
  }

  // Repo naming, in trust order. A secure-link token (when present and valid)
  // names the repo unguessably, so only the link holder can create it — the
  // strongest binding. Otherwise branch on classroom-team access: a student on
  // the classroom team came via the username invite flow (roster row already
  // has github_id), so the teacher reconciles by github_id -> name by id.
  // Otherwise it's the email-first flow (roster row keyed on email hash). The
  // derived team slug is good enough for a membership probe; on a false
  // negative we fall back to email-hash naming, the safe default (email is
  // known in both flows). Reconcile mirrors this branch.
  const teamSlug = `classroom50-${classroom}`
  const repoName = inviteToken
    ? onboardingRepoNameByToken(inviteToken)
    : (await isTeamMember(client, org, teamSlug, user.login))
      ? onboardingRepoNameByGithubId(user.id)
      : await onboardingRepoName(email)

  let repo: GitHubRepo
  let status: OnboardingResult["status"] = "created"

  try {
    repo = await client.request<GitHubRepo>(`/orgs/${org}/repos`, {
      method: "POST",
      body: {
        name: repoName,
        private: true,
        auto_init: true,
        description: `Classroom50 onboarding for ${classroom}`,
      },
    })
  } catch (err) {
    // 422 = repo already exists (a prior onboarding attempt). Re-fetch and
    // re-commit the payload so a half-finished attempt still self-heals.
    if (err instanceof GitHubAPIError && err.status === 422) {
      repo = await client.request<GitHubRepo>(`/repos/${org}/${repoName}`)
      status = "already-onboarded"
    } else if (err instanceof GitHubAPIError && err.isForbidden) {
      // Reached here despite the accept attempt above: either the org invite
      // couldn't be activated, or the org restricts member repo creation (an
      // owner-only setting). Replace GitHub's opaque "need admin access" text
      // with something the student/instructor can act on.
      throw new Error(
        `Couldn't create your onboarding repository in ${org}. Make sure you have ` +
          `accepted the ${org} organization invitation (check your email), then ` +
          `try again. If this keeps happening, your instructor may need to allow ` +
          `members to create repositories in the organization settings.`,
        { cause: err },
      )
    } else {
      throw err
    }
  }

  const branch = repo.default_branch || "main"
  const payloadYaml = stringifyOnboardingYaml(payload)

  // Commit the payload, riding out GitHub's post-create git-data lag (a fresh
  // auto_init repo's git APIs 404/409 transiently). No concurrent writers.
  await withFreshRepoRetry(async () => {
    const ref = await getBranchRefRepo(client, org, repoName, branch)
    const parentSha = ref.object.sha
    const currentCommit = await getCommitByRepo(
      client,
      org,
      repoName,
      parentSha,
    )
    const baseTreeSha = currentCommit.tree?.sha

    if (!parentSha || !baseTreeSha) {
      // Match the message isFreshRepoLagError keys on so withFreshRepoRetry
      // retries instead of surfacing a hard failure.
      throw new GitHubAPIError({
        status: 409,
        url: `/repos/${org}/${repoName}/git/commits`,
        message: "Git Repository is empty.",
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
    }

    const tree = await createTreeRepo(client, {
      org,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: [
        {
          path: ONBOARDING_YAML_PATH,
          mode: "100644",
          type: "blob",
          content: payloadYaml,
        },
      ],
    })

    const commit = await createCommitRepo(client, {
      org,
      repo: repoName,
      parents: [parentSha],
      tree: tree.sha,
      message: "Classroom50 onboarding self-report",
    })

    await updateRefForRepo({
      client,
      owner: org,
      repo: repoName,
      branch,
      commitSha: commit.sha,
    })
  })

  // Now that the self-report is committed, drop our own access to read-only.
  // The student created the repo (so they're its admin); demoting to "pull"
  // keeps the repo essentially hidden/uneditable for them while leaving the org
  // owner full admin (org repos are owned by the org) and not affecting teacher
  // reconciliation (which reads via the org). Best-effort and ordered strictly
  // AFTER the commit so a failure here can never strand a half-written repo;
  // it's non-fatal because the onboarding payload has already landed.
  try {
    await addRepoCollaborator({
      client,
      org,
      repo: repoName,
      username: user.login,
      permission: "pull",
    })
  } catch {
    // Non-fatal: the payload is committed and reconcilable regardless.
  }

  return { status, repo, repoName, payload }
}
