import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  UserPlus,
} from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { Link, useParams, useSearch, useRouter } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"
import { submitOnboarding } from "@/api/mutations/onboarding"
import { useOnboardingState } from "@/hooks/onboarding/useOnboardingState"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"
import { isValidEmail, isValidInviteToken } from "@/util/onboarding"
import { EnterDiv } from "@/lib/motionComponents"

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
      <EnterDiv className="card-body gap-6">
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
      </EnterDiv>
    </OnboardCard>
  </div>
)

const OnboardingStatus = ({
  classroom,
  title,
  message,
  tone = "success",
  action,
}: {
  classroom?: string
  title: string
  message: string
  tone?: "success" | "info"
  action?: React.ReactNode
}) => {
  const toneClasses =
    tone === "success"
      ? { box: "border-success/20 bg-success/5", icon: "text-success" }
      : { box: "border-info/20 bg-info/5", icon: "text-info" }
  return (
    <div className="min-h-screen bg-base-100">
      <OnboardNavbar />
      <OnboardCard>
        <EnterDiv className="card-body gap-6">
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
          <div className={`rounded-2xl border p-5 ${toneClasses.box}`}>
            <div className="flex gap-3">
              <CheckCircle2 className={`size-6 shrink-0 ${toneClasses.icon}`} />
              <p className="text-sm text-base-content/70">{message}</p>
            </div>
          </div>
          {action}
        </EnterDiv>
      </OnboardCard>
    </div>
  )
}

const OnboardingPage = () => {
  const { org, classroom } = useParams({ strict: false })
  // Untrusted: only seeds the claimed-email field; the session authorizes.
  const search = useSearch({ strict: false }) as {
    email?: string
    t?: string
    returnTo?: string
  }
  const prefilledEmail = typeof search.email === "string" ? search.email : ""
  // Where to send the student once they've onboarded AND become an active org
  // member (set when the accept page bounced them here). The route already
  // validated it's a same-origin relative path.
  const returnTo =
    typeof search.returnTo === "string" ? search.returnTo : undefined
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
  const queryClient = useQueryClient()

  const { user } = useGithubAuth()

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
    onSuccess: () => {
      // submitOnboarding accepted the pending invite, so the cached membership
      // (shared with the accept page) is stale. Invalidate so both this page's
      // redirect gate and the accept page re-read "active" — else they disagree
      // and the accept page bounces the student back here (loop).
      void queryClient.invalidateQueries({
        queryKey: ["github", "memberships", "orgs", org],
      })
    },
  })
  const runOnboard = useSafeSubmit()

  const state = useOnboardingState({
    org,
    classroom,
    justSubmitted: onboardMutation.isSuccess,
  })

  const router = useRouter()

  // Round-trip: once the student is an active org member, send them back to the
  // accept link. Reads the SAME membership query the accept page uses (freshened
  // above) so the two can't diverge into a loop; wait for "active" before going.
  const { data: orgMembership } = useGetOwnOrgMembership(org)
  const becameActiveMember = orgMembership?.state === "active"

  // Armed once the student has submitted with a returnTo.
  const returningToAssignment = Boolean(returnTo) && onboardMutation.isSuccess

  // Poll membership to flip active: submitOnboarding accepts the invite but
  // GitHub can lag (or the PATCH failed transiently), and the shared query
  // wouldn't otherwise re-read. Bounded, then the pending render shows a manual
  // link so a lag can't strand the student on an endless spinner.
  const MAX_MEMBERSHIP_POLLS = 6
  const [membershipPolls, setMembershipPolls] = useState(0)
  useQuery({
    queryKey: ["github", "onboarding-membership-poll", org, user?.id],
    queryFn: async () => {
      setMembershipPolls((n) => n + 1)
      // Re-read the shared membership query so the gate below (and the accept
      // page) see the fresh value.
      await queryClient.invalidateQueries({
        queryKey: ["github", "memberships", "orgs", org],
      })
      return membershipPolls
    },
    enabled:
      returningToAssignment &&
      !becameActiveMember &&
      membershipPolls < MAX_MEMBERSHIP_POLLS,
    refetchInterval: 1500,
  })
  const pollExhausted =
    returningToAssignment &&
    !becameActiveMember &&
    membershipPolls >= MAX_MEMBERSHIP_POLLS

  // One-shot latch: history.push stacks entries, so fire once when the gate
  // first opens rather than on every re-render.
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (returningToAssignment && becameActiveMember && !navigatedRef.current) {
      navigatedRef.current = true
      // Raw internal path: preserves the accept link's ?k= verbatim; the router
      // applies the basepath.
      router.history.push(returnTo!)
    }
  }, [returningToAssignment, becameActiveMember, returnTo, router])

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-base-100">
        <OnboardNavbar />
        <OnboardCard>
          <div className="loading loading-spinner loading-xl text-center m-auto" />
        </OnboardCard>
      </div>
    )
  }

  // No membership record at all: never invited. (A pending invite is not
  // "notInvited" — submitOnboarding self-heals by accepting it first.)
  if (state === "notInvited") {
    return <NotOrgMember org={org} classroom={classroom} />
  }

  // Just-submitted or an existing onboarding repo: awaiting reconcile. When
  // arriving with a returnTo, show a "taking you back" message (the effect above
  // bounces them once membership goes active).
  if (state === "pendingConfirmation") {
    const returning = returningToAssignment
    return (
      <OnboardingStatus
        classroom={classroom}
        tone="info"
        title={returning ? "You're enrolled" : "Pending confirmation"}
        message={
          returning
            ? pollExhausted
              ? "You're enrolled. If you're not redirected automatically, continue to your assignment below."
              : "Taking you back to your assignment…"
            : "Your details are in — your instructor just needs to confirm your enrollment. There's nothing more for you to do here."
        }
        action={
          returning && pollExhausted && returnTo ? (
            <button
              type="button"
              className="btn btn-primary w-full bg-[#4e80ee]"
              onClick={() => router.history.push(returnTo)}
            >
              Continue to your assignment
            </button>
          ) : undefined
        }
      />
    )
  }

  // Already has classroom access: show "you're all set" instead of the form.
  if (state === "allSet") {
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
        <EnterDiv className="card-body gap-6">
          <div>
            <span className="badge badge-primary badge-soft gap-2">
              <Mail className="size-4" />
              Onboarding
            </span>
            <h1 className="mt-6 text-2xl font-bold">
              {returnTo
                ? "Confirm your enrollment before accepting the assignment"
                : "Confirm your enrollment"}
            </h1>
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
            onClick={() => void runOnboard(() => onboardMutation.mutateAsync())}
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
        </EnterDiv>
      </OnboardCard>
    </div>
  )
}

export default OnboardingPage
