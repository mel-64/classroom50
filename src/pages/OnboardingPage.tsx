import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  UserPlus,
} from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { Link, useParams, useSearch } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"
import { submitOnboarding } from "@/api/mutations/onboarding"
import {
  hasActiveOnboardingForClassroom,
  isTeamMember,
} from "@/hooks/github/queries"
import { isValidEmail, isValidInviteToken } from "@/util/onboarding"

const OnboardNavbar = () => (
  <div className="navbar bg-base-100 shadow-sm">
    <Link to="/">
      <div className="flex p-6 text-lg font-bold">
        <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
      </div>
    </Link>
  </div>
)

const OnboardCard = ({ children }: { children: React.ReactNode }) => (
  <div className="card w-200 max-w-[calc(100vw-2em)] p-8 m-auto rounded-xl mt-10 border border-[#eee]">
    {children}
  </div>
)

const NotOrgMember = ({
  org,
  classroom,
}: {
  org?: string
  classroom?: string
}) => (
  <div className="min-h-screen bg-base-100">
    <OnboardNavbar />
    <OnboardCard>
      <div className="card-body gap-6">
        <div>
          <span className="badge badge-ghost badge-soft gap-2">
            <Mail className="size-4" />
            Onboarding
          </span>
          <h1 className="mt-6 text-2xl font-bold">Nothing to do here yet</h1>
          <p className="mt-2 text-base text-base-content/70">
            We couldn&apos;t find an invitation for your account to the{" "}
            <span className="font-semibold text-base-content">{org}</span>{" "}
            organization.
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-200/50 p-5">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-base-300/40 text-base-content/60">
              <UserPlus className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-base-content">
                Waiting on an invitation
              </h2>
              <p className="mt-2 leading-5 text-sm text-base-content/70">
                If your instructor has invited you to{" "}
                <span className="font-semibold text-base-content">
                  {classroom}
                </span>
                , check your email for the GitHub invitation and accept it, then
                return to this page and refresh. Otherwise, there&apos;s nothing
                you need to do here right now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </OnboardCard>
  </div>
)

const OnboardingStatus = ({
  classroom,
  title,
  message,
  tone = "success",
}: {
  classroom?: string
  title: string
  message: string
  tone?: "success" | "info"
}) => (
  <div className="min-h-screen bg-base-100">
    <OnboardNavbar />
    <OnboardCard>
      <div className="card-body gap-6">
        <div>
          <span className="badge badge-primary badge-soft gap-2">
            <Mail className="size-4" />
            Onboarding
          </span>
          <h1 className="mt-6 text-2xl font-bold">{title}</h1>
          {classroom && (
            <p className="mt-2 text-sm text-base-content/60">{classroom}</p>
          )}
        </div>
        <div
          className={`rounded-2xl border p-5 ${
            tone === "success"
              ? "border-success/20 bg-success/5"
              : "border-info/20 bg-info/5"
          }`}
        >
          <div className="flex gap-3">
            <CheckCircle2
              className={`size-6 shrink-0 ${
                tone === "success" ? "text-success" : "text-info"
              }`}
            />
            <p className="text-sm text-base-content/70">{message}</p>
          </div>
        </div>
      </div>
    </OnboardCard>
  </div>
)

const OnboardingPage = () => {
  const { org, classroom } = useParams({ strict: false })
  // Untrusted: only seeds the claimed-email field; the session authorizes.
  const search = useSearch({ strict: false }) as { email?: string; t?: string }
  const prefilledEmail = typeof search.email === "string" ? search.email : ""
  // Secure-link token: reconcile's strongest match key. Absent/garbage degrades
  // to the classroom-wide flow (reconcile then matches by github_id, else email).
  const inviteToken =
    typeof search.t === "string" && isValidInviteToken(search.t)
      ? search.t.trim()
      : undefined
  const [email, setEmail] = useState(prefilledEmail)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const client = useGitHubClient()

  const { user } = useGithubAuth()
  const { data: orgMembership, isLoading: loadingMembership } =
    useGetOwnOrgMembership(org)

  // Repo-based "submitted" detection that survives reload: an onboarding repo
  // for this classroom exists (awaiting the teacher's reconcile).
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
  // here", NOT fully enrolled). Used to swap the form for a "you're all set" page.
  //
  // Slug caveat: derived as `classroom50-<classroom>` since the authoritative
  // slug lives in a config repo students can't read. On a name collision it
  // degrades safely to the form (re-submit is idempotent), never false access.
  const teamSlug = `classroom50-${classroom}`
  const { data: onClassroomTeam, isLoading: loadingTeam } = useQuery({
    queryKey: ["github", "team-membership", org, teamSlug, user?.login],
    queryFn: () => isTeamMember(client, org ?? "", teamSlug, user?.login ?? ""),
    enabled: Boolean(org && user?.login && orgMembership),
  })

  const emailValid = isValidEmail(email)
  const nameValid = firstName.trim().length > 0 && lastName.trim().length > 0
  const formValid = emailValid && nameValid

  const onboardMutation = useMutation({
    mutationFn: () =>
      submitOnboarding(client, {
        org: org ?? "",
        classroom: classroom ?? "",
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        invite_token: inviteToken,
      }),
  })

  if (
    loadingMembership ||
    (orgMembership && (loadingOnboarded || loadingTeam))
  ) {
    return (
      <div className="min-h-screen bg-base-100">
        <OnboardNavbar />
        <OnboardCard>
          <div className="loading loading-spinner loading-xl text-center m-auto" />
        </OnboardCard>
      </div>
    )
  }

  // Gate on having a membership record at all. A "pending" invite still lets
  // through: submitOnboarding self-heals by accepting the invite before creating
  // the repo. Only a missing membership (query 404s) means never invited.
  if (!orgMembership) {
    return <NotOrgMember org={org} classroom={classroom} />
  }

  // Just-submitted (this session) or an existing onboarding repo: awaiting
  // reconcile. Show it before the form.
  if (onboardMutation.isSuccess || hasOnboarded) {
    return (
      <OnboardingStatus
        classroom={classroom}
        tone="info"
        title="Pending confirmation"
        message="Your details are in — your instructor just needs to confirm your enrollment. There's nothing more for you to do here."
      />
    )
  }

  // Already has classroom access: show "you're all set" instead of the form.
  if (onClassroomTeam) {
    return (
      <OnboardingStatus
        classroom={classroom}
        tone="success"
        title="You're all set"
        message="You already have access to this classroom — there's nothing more you need to do here. You can accept assignments your instructor shares with you."
      />
    )
  }

  return (
    <div className="min-h-screen bg-base-100">
      <OnboardNavbar />
      <OnboardCard>
        <div className="card-body gap-6">
          <div>
            <span className="badge badge-primary badge-soft gap-2">
              <Mail className="size-4" />
              Onboarding
            </span>
            <h1 className="mt-6 text-2xl font-bold">Confirm your enrollment</h1>
            <p className="mt-2 text-base text-base-content/70">
              This links your GitHub account to your instructor&apos;s class
              roster for{" "}
              <span className="font-semibold text-base-content">
                {classroom}
              </span>
              .
            </p>
          </div>

          <div className="flex gap-4 bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm text-base-content/60">
                <GitHub className="size-4" />
                <span>{user?.login ?? "Checking GitHub user..."}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="onboard-first-name"
                className="text-sm font-medium text-base-content"
              >
                First name
              </label>
              <input
                id="onboard-first-name"
                type="text"
                value={firstName}
                placeholder="Ada"
                className="input w-full mt-2"
                disabled={onboardMutation.isPending}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="onboard-last-name"
                className="text-sm font-medium text-base-content"
              >
                Last name
              </label>
              <input
                id="onboard-last-name"
                type="text"
                value={lastName}
                placeholder="Lovelace"
                className="input w-full mt-2"
                disabled={onboardMutation.isPending}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="onboard-email"
              className="text-sm font-medium text-base-content"
            >
              Your university email
            </label>
            <p className="mt-1 text-xs text-base-content/60">
              Enter the email your instructor used to invite you, so they can
              match you to the class roster.
            </p>
            <div className="mt-2 flex">
              <Mail className="size-6 mr-2 text-[#bbb]" />
              <input
                id="onboard-email"
                type="email"
                value={email}
                placeholder="student@university.edu"
                className="input w-full"
                disabled={onboardMutation.isPending}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {email && !emailValid && (
              <p className="text-error text-sm mt-1">
                Enter a valid email address.
              </p>
            )}
          </div>

          {onboardMutation.isError && (
            <div className="alert alert-error alert-soft text-sm">
              {onboardMutation.error instanceof Error
                ? onboardMutation.error.message
                : "Something went wrong. Please try again."}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary w-full bg-[#4e80ee]"
            disabled={onboardMutation.isPending || !formValid}
            onClick={() => onboardMutation.mutate()}
          >
            {onboardMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirming...
              </>
            ) : (
              "Confirm enrollment"
            )}
          </button>
        </div>
      </OnboardCard>
    </div>
  )
}

export default OnboardingPage
