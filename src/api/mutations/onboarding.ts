import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  createCommitRepo,
  createTreeRepo,
  updateRefForRepo,
} from "@/hooks/github/mutations"
import {
  getBranchRefRepo,
  getCommitByRepo,
  withFreshRepoRetry,
} from "@/hooks/github/queries"
import type { GitHubRepo } from "@/hooks/github/types"
import { getAuthenticatedUser } from "@/api/queries/users"
import { acceptPendingOrgInvite } from "@/api/mutations/users"
import {
  ONBOARDING_YAML_PATH,
  onboardingRepoName,
  type OnboardingPayload,
} from "@/util/onboarding"
import { stringifyOnboardingYaml } from "@/util/yaml"

export type OnboardingResult = {
  status: "created" | "already-onboarded"
  repo: GitHubRepo
  payload: OnboardingPayload
}

// Create the deterministically-named onboarding repo in the org and commit the
// self-report payload. The student is authenticated, so username/id come from
// GitHub (unforgeable). Idempotent: a re-run on an existing repo is treated as
// "already-onboarded" (the teacher reconcile reads whatever payload is present).
export async function submitOnboarding(
  client: GitHubClient,
  input: { org: string; classroom: string; email: string },
): Promise<OnboardingResult> {
  const { org, classroom, email } = input

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
    github_username: user.login,
    github_id: user.id,
    classroom,
    created_at: new Date().toISOString(),
  }

  const repoName = await onboardingRepoName(email)

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

  return { status, repo, payload }
}
