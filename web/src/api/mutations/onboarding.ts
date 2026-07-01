import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  addRepoCollaborator,
  archiveRepo,
  createCommitRepo,
  createTreeRepo,
  deleteRepo,
  updateRefForRepo,
} from "@/hooks/github/mutations"
import {
  resolveOwnOnboardingRepo,
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

// Create (or reuse) the student's onboarding repo and commit the self-report.
// Idempotent: a re-submit reuses the existing repo ("already-onboarded").
export async function submitOnboarding(
  client: GitHubClient,
  input: {
    org: string
    classroom: string
    email: string
    first_name: string
    last_name: string
    // Teacher-issued secure-link token; reconcile's strongest match key.
    invite_token?: string
  },
): Promise<OnboardingResult> {
  const { org, classroom, email, first_name, last_name } = input
  const inviteToken =
    input.invite_token && isValidInviteToken(input.invite_token)
      ? input.invite_token.trim()
      : undefined

  const user = await getAuthenticatedUser(client)

  // A pending (not-yet-accepted) invitee is not a member, so the repo create
  // below 403s. Activate the invite first. Best-effort: a no-op if already
  // active.
  await acceptPendingOrgInvite(client, org)

  // Orphan guard: reuse the student's existing onboarding repo for this
  // classroom instead of minting a duplicate on a re-submit. Foot-gun:
  // resolveOwnOnboardingRepo THROWS on a transient list failure rather than
  // returning "none", so a blip can't fork a second repo for a student who
  // already has one.
  const existing = await resolveOwnOnboardingRepo(
    client,
    org,
    user.id,
    classroom,
  )
  const existingRepoName =
    existing.status === "none" ? undefined : existing.repo

  const payload: OnboardingPayload = {
    email: email.trim(),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    github_username: user.login,
    github_id: user.id,
    classroom,
    created_at: new Date().toISOString(),
    ...(inviteToken ? { invite_token: inviteToken } : {}),
  }

  const reusingExisting = existingRepoName !== undefined
  const repoName = existingRepoName ?? onboardingRepoName(user.id)

  let repo: GitHubRepo
  let status: OnboardingResult["status"] = reusingExisting
    ? "already-onboarded"
    : "created"
  // Only clean up on commit failure when THIS call created the repo — a reused
  // repo may already hold a valid payload.
  let createdThisCall = false

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
    createdThisCall = true
  } catch (err) {
    // 422 = the name already exists — normally our own half-finished attempt,
    // but the name is guessable so it could be a squatted repo. Re-fetch; the
    // write-access guard below turns a squat into a clear error, not a 403
    // mid-commit.
    if (err instanceof GitHubAPIError && err.status === 422) {
      repo = await client.request<GitHubRepo>(`/repos/${org}/${repoName}`)
      status = "already-onboarded"
    } else if (err instanceof GitHubAPIError && err.isForbidden) {
      // Invite couldn't be activated, or the org restricts member repo
      // creation. Replace GitHub's opaque "need admin access" text.
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

  // A reused/re-fetched repo could be a squat we can't push to. Fail loudly with
  // an actionable message rather than 403-ing mid-commit. FOOTGUN: `permissions`
  // is absent on some responses — treat absent as "ours" so a missing field
  // can't block a legitimate onboarding (the commit surfaces any real failure).
  if (repo.permissions && !repo.permissions.push) {
    throw new Error(
      `The onboarding repository name (${repoName}) in ${org} is already taken ` +
        `by a repository you can't write to. Ask your instructor to remove ` +
        `the "${repoName}" repository from the ${org} organization, then try again.`,
    )
  }

  const branch = repo.default_branch || "main"
  const payloadYaml = stringifyOnboardingYaml(payload)

  // Commit the payload, riding out GitHub's post-create git-data lag (a fresh
  // auto_init repo's git APIs 404/409 transiently).
  try {
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
        // Message must match what isFreshRepoLagError keys on, so the retry
        // fires instead of surfacing a hard failure.
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
  } catch (err) {
    if (createdThisCall) {
      // Best-effort cleanup of the empty repo we created; fall back to archive
      // if delete isn't permitted, then re-throw.
      try {
        await deleteRepo(client, { owner: org, repo: repoName })
      } catch {
        try {
          await archiveRepo(client, { owner: org, repo: repoName })
        } catch {
          // Orphan guard will reuse it next time.
        }
      }
    }
    throw err
  }

  // Self-report committed; drop our access to read-only. Best-effort and
  // strictly AFTER the commit so a failure here can't strand a half-written
  // repo. Org owner keeps admin; teacher reconcile reads via the org.
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
