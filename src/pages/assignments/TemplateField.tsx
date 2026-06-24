import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
} from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useOptionalGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import {
  verifyTemplateAccess,
  type TemplateAccessVerification,
} from "@/api/mutations/assignments"
import { teamHasRepoAccess } from "@/hooks/github/queries"
import {
  useDebouncedValue,
  normalizeOnBlur,
  type StringField,
} from "./formFieldHelpers"
import { InlineNote, InlineCode as Code } from "@/components/InlineNote"

// Advisory, non-blocking pre-flight for the Template Repository field: checks
// the OAuth token can reach the typed repo and annotates the field without
// rewriting it. Mirrors RunnerField.
export const TemplateField = ({
  field,
  org,
  classroom,
}: {
  field: StringField
  org?: string
  classroom?: string
}) => {
  const client = useOptionalGitHubClient()
  const { user, isLoadingUser } = useGithubAuth()
  const viewerLogin = user?.login
  const rawValue = field.state.value
  const trimmedValue = rawValue.trim()
  const debouncedValue = useDebouncedValue(trimmedValue, 500)

  // viewerLogin decides ok vs ok-verify, so wait for it — verifying mid-load
  // would show a verdict that flips once the profile resolves.
  const enabled = Boolean(client && org && debouncedValue && !isLoadingUser)

  const verificationQuery = useQuery({
    queryKey: ["template-access", org, viewerLogin, debouncedValue],
    queryFn: () =>
      verifyTemplateAccess(client!, org!, debouncedValue, viewerLogin),
    enabled,
    staleTime: 30_000,
    retry: false,
  })

  // A cleared field has nothing to verify, so don't show "Checking…" while the
  // debounce drains.
  const pending =
    enabled &&
    trimmedValue !== "" &&
    (trimmedValue !== debouncedValue || verificationQuery.isFetching)

  const verification =
    enabled && !pending ? (verificationQuery.data ?? null) : null

  // For an in-org private template, check whether the classroom team already
  // has read. Drives the checkmark-vs-"added on create" message below.
  const inOrgPrivateTemplate =
    verification?.kind === "ok" &&
    verification.inOrg &&
    verification.visibility === "private"
      ? { owner: verification.owner, repo: verification.repo }
      : null
  const teamAccessEnabled = Boolean(
    client && org && classroom && inOrgPrivateTemplate,
  )

  const teamAccessQuery = useQuery({
    queryKey: [
      "template-team-access",
      org,
      classroom,
      inOrgPrivateTemplate?.owner ?? null,
      inOrgPrivateTemplate?.repo ?? null,
    ],
    queryFn: () =>
      teamHasRepoAccess(client!, {
        org: org!,
        classroom: classroom!,
        owner: inOrgPrivateTemplate!.owner,
        repo: inOrgPrivateTemplate!.repo,
      }),
    enabled: teamAccessEnabled,
    staleTime: 30_000,
    retry: false,
  })

  // Default to the "will be granted on create" message until the team check
  // resolves, rather than blocking the verdict.
  const teamHasAccess = teamAccessEnabled
    ? teamAccessQuery.data === true
    : undefined

  return (
    <>
      <label
        htmlFor={field.name}
        className="label font-bold mb-2 flex items-center gap-1.5"
      >
        <GitHub className="size-4 text-[#ddd] opacity-70" />
        Template Repository
      </label>
      <input
        id={field.name}
        name={field.name}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="<owner>/<repo>"
        className="input w-full"
        value={rawValue}
        onBlur={normalizeOnBlur(field)}
        onChange={(e) => field.handleChange(e.target.value)}
      />

      <TemplateVerificationNote
        verification={verification}
        pending={pending}
        org={org}
        teamHasAccess={teamHasAccess}
      />

      <p className="label pt-2">
        Optional. Students receive a copy of this repository. Leave blank for an
        empty repo with just the autograder.
      </p>
    </>
  )
}

const TemplateVerificationNote = ({
  verification,
  pending,
  org,
  teamHasAccess,
}: {
  verification: TemplateAccessVerification | null
  pending: boolean
  org?: string
  // For an in-org private template: true if the classroom team already has
  // read, false if it'll be granted on create, undefined if N/A or unresolved.
  teamHasAccess?: boolean
}) => {
  if (pending) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-base-content/60">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        Checking template access…
      </p>
    )
  }

  if (!verification || verification.kind === "empty") return null

  const fallbackOrg = org ?? "your org"

  switch (verification.kind) {
    case "ok": {
      // Students can't read an in-org private template directly; the classroom
      // team grant is what lets them. Show whether that grant already exists or
      // will be added on create (see tryGrantTeamTemplateRead).
      if (verification.inOrg && verification.visibility === "private") {
        if (teamHasAccess === true) {
          return (
            <Note tone="success" icon={CheckCircle2}>
              Private template in {verification.owner} (branch{" "}
              <Code>{verification.branch}</Code>). The classroom team already
              has read access — students can copy it.
            </Note>
          )
        }
        return (
          <Note tone="success" icon={CheckCircle2}>
            Private template in {verification.owner} (branch{" "}
            <Code>{verification.branch}</Code>). The classroom team doesn't have
            access yet; it'll be added automatically when you create the
            assignment, so students can copy it.
          </Note>
        )
      }
      const where = verification.inOrg ? "" : ` in ${verification.owner}`
      return (
        <Note tone="success" icon={CheckCircle2}>
          {verification.visibility === "public" ? "Public" : "Private"} template
          {where}, branch <Code>{verification.branch}</Code>. Students can access
          it.
        </Note>
      )
    }

    case "ok-verify":
      return (
        <Note
          tone="warning"
          icon={Info}
          policy={{ owner: verification.owner, href: verification.policyUrl }}
        >
          Reachable in {verification.owner} (branch{" "}
          <Code>{verification.branch}</Code>). If {verification.owner} restricts
          third-party apps, students can't copy it until an owner approves
          Classroom 50.
        </Note>
      )

    case "invalid":
      return (
        <Note tone="error" icon={AlertTriangle}>
          {verification.message}
        </Note>
      )

    case "not-visible":
      return (
        <Note tone="error" icon={AlertTriangle}>
          {verification.owner}/{verification.repo} isn't visible to you. Make it
          public or copy it into {fallbackOrg}.
        </Note>
      )

    case "not-template":
      return (
        <Note tone="error" icon={AlertTriangle}>
          {verification.owner}/{verification.repo} isn't a template repo. Enable
          it in the repo's Settings.
        </Note>
      )

    case "restricted":
      return (
        <Note
          tone="error"
          icon={AlertTriangle}
          policy={{ owner: verification.owner, href: verification.policyUrl }}
        >
          {verification.owner} blocked access to {verification.repo}. It
          restricts third-party apps; an owner must approve Classroom 50.
        </Note>
      )

    case "unknown":
      return (
        <Note tone="neutral" icon={HelpCircle}>
          Couldn't verify {verification.owner}/{verification.repo} now. It's
          rechecked when students accept.
        </Note>
      )

    case "private-out-of-org":
      return (
        <Note tone="error" icon={AlertTriangle}>
          {verification.owner}/{verification.repo} is private and outside{" "}
          {fallbackOrg}. Make it public or copy it into {fallbackOrg}.
        </Note>
      )

    case "no-branch":
      return (
        <Note tone="error" icon={AlertTriangle}>
          {verification.owner}/{verification.repo} has no default branch. Push a
          commit, or add <Code>@&lt;branch&gt;</Code>.
        </Note>
      )

    case "rate-limited":
      return (
        <Note tone="neutral" icon={HelpCircle}>
          GitHub rate limit hit. Try again shortly.
        </Note>
      )

    default: {
      // A new verdict kind becomes a compile error here.
      const _never: never = verification
      return _never
    }
  }
}

// Wraps InlineNote with an optional OAuth-policy link for the cases where an
// org owner must approve the app.
const Note = ({
  tone,
  icon,
  policy,
  children,
}: {
  tone: "success" | "warning" | "error" | "neutral"
  icon: typeof Info
  policy?: { owner: string; href: string }
  children: ReactNode
}) => (
  <InlineNote tone={tone} icon={icon} className="mt-1.5">
    <span>{children}</span>
    {policy && (
      <a
        href={policy.href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 flex items-center gap-1 font-semibold underline"
      >
        Check {policy.owner}'s OAuth app policy
        <ExternalLink className="size-3.5 shrink-0" />
      </a>
    )}
  </InlineNote>
)
