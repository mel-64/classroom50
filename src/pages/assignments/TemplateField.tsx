import { useQuery } from "@tanstack/react-query"
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
import {
  useDebouncedValue,
  normalizeOnBlur,
  type StringField,
} from "./formFieldHelpers"

// Advisory pre-flight check for the Template Repository field. As the teacher
// types `<owner>/<repo>`, it verifies the OAuth token (the same one students
// use) can reach the repo. Non-blocking: it annotates but never rewrites the
// value, mirroring RunnerField.
export const TemplateField = ({
  field,
  org,
}: {
  field: StringField
  org?: string
}) => {
  const client = useOptionalGitHubClient()
  const { user, isLoadingUser } = useGithubAuth()
  const viewerLogin = user?.login
  const rawValue = field.state.value
  const trimmedValue = rawValue.trim()
  const debouncedValue = useDebouncedValue(trimmedValue, 500)

  // Wait for the viewer to load before verifying: viewerLogin distinguishes an
  // own-account template (ok) from a third-party org (ok-verify), so checking
  // mid-load would show a verdict that flips once the profile resolves.
  const enabled = Boolean(client && org && debouncedValue && !isLoadingUser)

  const verificationQuery = useQuery({
    queryKey: ["template-access", org, viewerLogin, debouncedValue],
    queryFn: () =>
      verifyTemplateAccess(client!, org!, debouncedValue, viewerLogin),
    enabled,
    staleTime: 30_000,
    retry: false,
  })

  const pending =
    enabled &&
    (trimmedValue !== debouncedValue || verificationQuery.isFetching)

  return (
    <>
      <div>
        <label htmlFor={field.name} className="label font-bold mb-2">
          Template Repository
        </label>
      </div>
      <div className="flex items-center">
        <GitHub className="size-6 mr-2 text-[#ddd] opacity-50" />
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
      </div>

      <TemplateVerificationNote
        verification={
          enabled && !pending ? (verificationQuery.data ?? null) : null
        }
        pending={pending}
        org={org}
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
}: {
  verification: TemplateAccessVerification | null
  pending: boolean
  org?: string
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

  switch (verification.kind) {
    case "ok":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            {verification.visibility === "public" ? "Public" : "Private"}{" "}
            template
            {verification.inOrg ? "" : ` in ${verification.owner}`}. Students can
            access it (branch{" "}
            <code className="text-xs">{verification.branch}</code>).
          </span>
        </p>
      )

    case "ok-verify":
      return (
        <div className="mt-1.5 flex items-start gap-1.5 text-sm text-warning">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>
              {verification.visibility === "public" ? "Public" : "Private"}{" "}
              template in{" "}
              <span className="font-medium">{verification.owner}</span> (branch{" "}
              <code className="text-xs">{verification.branch}</code>). Reachable,
              but {verification.owner} may restrict third-party apps. If so,
              students can't copy it until an owner approves the Classroom 50
              app.
            </p>
            <a
              href={verification.policyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 link link-warning"
            >
              Check {verification.owner}'s OAuth app policy
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </div>
        </div>
      )

    case "invalid":
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-error">
          <AlertTriangle className="size-4 shrink-0" />
          {verification.message}
        </p>
      )

    case "not-visible":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {verification.owner}/{verification.repo} isn't visible to your
            account. Make it public or copy it into {org ?? "your org"}.
          </span>
        </p>
      )

    case "not-template":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {verification.owner}/{verification.repo} isn't a template repo.
            Enable Settings → "Template repository" on it.
          </span>
        </p>
      )

    case "restricted":
      return (
        <div className="mt-1.5 flex items-start gap-1.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>
              {verification.owner} denied access to {verification.owner}/
              {verification.repo}. It likely restricts third-party apps, so
              students won't be able to copy it until an owner approves the
              Classroom 50 app.
            </p>
            <a
              href={verification.policyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 link link-error"
            >
              Check {verification.owner}'s OAuth app policy
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </div>
        </div>
      )

    case "unknown":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-base-content/60">
          <HelpCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            Couldn't verify {verification.owner}/{verification.repo} access right
            now. It'll be checked again when students accept.
          </span>
        </p>
      )

    case "private-out-of-org":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {verification.owner}/{verification.repo} is private and outside{" "}
            {org ?? "your org"}, so students can't be granted access. Make it
            public or copy it into {org ?? "your org"}.
          </span>
        </p>
      )

    case "no-branch":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {verification.owner}/{verification.repo} has no default branch. Push
            an initial commit, or specify a branch as {verification.owner}/
            {verification.repo}@&lt;branch&gt;.
          </span>
        </p>
      )

    case "rate-limited":
      return (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-base-content/60">
          <HelpCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            Hit a GitHub rate limit checking {verification.owner}/
            {verification.repo}. Try again shortly.
          </span>
        </p>
      )

    default: {
      // Exhaustiveness guard: a new TemplateAccessVerification kind without a
      // case here is a compile error rather than a silent blank note.
      const _never: never = verification
      return _never
    }
  }
}
