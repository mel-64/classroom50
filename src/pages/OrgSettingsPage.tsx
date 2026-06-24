import { useRef, useState } from "react"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useParams } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { putRepoSecret, validateServiceToken } from "@/hooks/github/mutations"
import { githubKeys } from "@/hooks/github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import useGetServiceTokenStatus from "@/hooks/useGetServiceTokenStatus"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Info,
  TriangleAlert,
} from "lucide-react"

const DEFAULT_EXPIRY_DAYS = 120
const MIN_EXPIRY_DAYS = 1
const MAX_EXPIRY_DAYS = 366

// One descriptor per service-token status, keeping the banner's style, icon, and
// title in sync from a single source.
const TOKEN_STATUS_BANNER = {
  present: {
    className: "border-success/30 bg-success/10",
    Icon: CheckCircle2,
    iconClassName: "text-success",
    title: "A service token is already set",
  },
  missing: {
    className: "border-info/30 bg-info/10",
    Icon: Info,
    iconClassName: "text-info",
    title: "No service token set yet",
  },
  unknown: {
    className: "border-warning/30 bg-warning/10",
    Icon: TriangleAlert,
    iconClassName: "text-warning",
    title: "Couldn’t check the service token",
  },
} as const

export const OrgSettingsPane = ({ onSubmit }: { onSubmit?: () => void }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { org } = useParams({ strict: false })
  const [serviceToken, setServiceToken] = useState("")
  const [savedKind, setSavedKind] = useState<null | "saved" | "updated">(null)
  const [expiryDays, setExpiryDays] = useState(String(DEFAULT_EXPIRY_DAYS))
  const tokenInputRef = useRef<HTMLInputElement>(null)
  const expiryInputRef = useRef<HTMLInputElement>(null)

  const { data: tokenStatus, isLoading: tokenStatusLoading } =
    useGetServiceTokenStatus(org ?? "")
  const tokenAlreadySet = tokenStatus?.status === "present"

  const [now] = useState(() => Date.now())

  const parsedExpiry = Number(expiryDays)
  const expiryValid =
    Number.isInteger(parsedExpiry) &&
    parsedExpiry >= MIN_EXPIRY_DAYS &&
    parsedExpiry <= MAX_EXPIRY_DAYS

  const expiresDate = expiryValid
    ? new Date(now + parsedExpiry * 24 * 60 * 60 * 1000)
    : null

  const serviceTokenUrl =
    "https://github.com/settings/personal-access-tokens/new?" +
    new URLSearchParams({
      name: `Classroom 50 Actions Token`,
      description: `Service token for Classroom 50 score collection. Contents: Read on all repositories in the ${org} organization`,
      target_name: org ?? "",
      expires_in: String(expiryValid ? parsedExpiry : DEFAULT_EXPIRY_DAYS),
      contents: "read",
    }).toString()

  const patMutation = useMutation({
    mutationFn: async () => {
      await validateServiceToken(serviceToken, org)
      return putRepoSecret(
        client,
        org,
        "classroom50",
        "CLASSROOM50_SERVICE_TOKEN",
        serviceToken,
      )
    },
    onSuccess: () => {
      setServiceToken("")
      setSavedKind(tokenAlreadySet ? "updated" : "saved")
      onSubmit?.()
      queryClient.invalidateQueries({ queryKey: ["orgs"] })
      queryClient.invalidateQueries({
        queryKey: githubKeys.serviceToken(org ?? ""),
      })
    },
  })

  return (
    <div>
      <div className="mt-8">
        <h2 className="text-xl font-bold">Service Token</h2>
        <p className="mt-2 text-sm text-base-content/60">
          Classroom 50 needs a service token, a fine-grained Personal Access
          Token (PAT) with read access to the repositories in your classroom’s
          GitHub organization. It is stored as the{" "}
          <code className="text-xs">CLASSROOM50_SERVICE_TOKEN</code> secret on
          your <span className="font-semibold">classroom50</span> config repo,
          where the nightly score-collection workflow uses it to read student
          submissions.
        </p>

        {!tokenStatusLoading && tokenStatus && (() => {
          const banner = TOKEN_STATUS_BANNER[tokenStatus.status]
          const { Icon } = banner
          return (
            <div
              className={[
                "mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm",
                banner.className,
              ].join(" ")}
            >
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${banner.iconClassName}`}
              />
              <div className="min-w-0">
                <p className="font-semibold text-base-content">
                  {banner.title}
                </p>
                <p className="mt-1 text-base-content/70">
                  {tokenStatus.message}
                </p>
                {tokenStatus.status === "present" && (
                  <p className="mt-1 text-base-content/70">
                    Saving below will replace the existing token (an update).
                    The old token is overwritten in place.
                  </p>
                )}
              </div>
            </div>
          )
        })()}

        <div className="mt-5">
          <label
            htmlFor="token-expiry"
            className="block text-sm font-semibold"
          >
            Token expiry
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label
              className={[
                "input input-bordered flex w-36 items-center gap-2",
                expiryValid ? "" : "input-error",
              ].join(" ")}
            >
              <input
                id="token-expiry"
                ref={expiryInputRef}
                type="number"
                min={MIN_EXPIRY_DAYS}
                max={MAX_EXPIRY_DAYS}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm text-base-content/50">days</span>
            </label>

            {expiresDate ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-base-200 px-3 py-1 text-xs text-base-content/70">
                <CalendarClock className="size-3.5" />
                Expires {expiresDate.toLocaleDateString()}
              </span>
            ) : (
              <span className="text-xs text-error">
                Enter {MIN_EXPIRY_DAYS}–{MAX_EXPIRY_DAYS} days
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-base-content/50">
            Valid range is {MIN_EXPIRY_DAYS}–{MAX_EXPIRY_DAYS} days (GitHub’s
            maximum).
          </p>
        </div>

        <a
          className={[
            "btn btn-primary mt-4",
            expiryValid ? "" : "btn-disabled",
          ].join(" ")}
          href={serviceTokenUrl}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!expiryValid}
          onClick={(e) => {
            // aria-disabled is visual only; also block activation so an invalid
            // expiry can't navigate to GitHub with the silent default.
            if (!expiryValid) {
              e.preventDefault()
              expiryInputRef.current?.focus()
              return
            }
            // Focus the token field so the user can paste on return.
            window.setTimeout(() => tokenInputRef.current?.focus(), 0)
          }}
        >
          <ExternalLink className="size-4" />
          Generate token on GitHub
        </a>
        <p className="mt-2 text-xs text-base-content/50">
          Opens GitHub’s token form with the name, resource owner, expiry, and{" "}
          <span className="font-semibold">Contents: Read</span> permission
          pre-filled.
        </p>

        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="font-semibold text-base-content">
            On the GitHub page, before generating the token:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-base-content/80">
            <li>
              Set <span className="font-semibold">Repository access</span> to{" "}
              <span className="font-semibold">All repositories</span>.{" "}
              <span className="text-base-content/60">
                “Only select repositories” will miss student repos created later
                and break score collection.
              </span>
            </li>
            <li>
              Under <span className="font-semibold">Permissions</span>, confirm{" "}
              <span className="font-semibold">Contents: Read</span> (Metadata:
              Read is included automatically).
            </li>
          </ul>
          <p className="mt-3 text-base-content/80">
            The token expires after the period you set above. When it expires,
            the score-collection workflow will fail until you generate a new
            token and save it here again, so set a reminder to rotate it before
            then.
          </p>
        </div>

        <p className="mt-3 text-sm text-base-content/60">
          After generating the token on GitHub, copy it and paste it below.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!patMutation.isPending) patMutation.mutate()
          }}
        >
          <div className="flex flex-col gap-2 w-full pb-10">
            <label className="label font-bold mt-4 text-sm">
              {tokenAlreadySet ? "Enter new service token" : "Enter service token"}
            </label>
            <input
              ref={tokenInputRef}
              type="password"
              placeholder="Enter token (e.g., github_pat_123...)"
              className="input input-bordered w-full"
              autoComplete="off"
              value={serviceToken}
              onChange={(e) => {
                setServiceToken(e.target.value)
                setSavedKind(null)
                if (patMutation.isError) patMutation.reset()
              }}
            />
            <p className="text-xs text-base-content/50">
              We’ll check the token is valid before saving. Double-check you
              chose <span className="font-semibold">All repositories</span> when
              creating it.
            </p>
            {patMutation.isError && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {patMutation.error instanceof Error
                    ? patMutation.error.message
                    : "Could not validate or save the token."}
                </span>
              </div>
            )}
            {savedKind && (
              <p className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="size-4" />
                {savedKind === "updated"
                  ? "Service token checked and updated."
                  : "Service token checked and saved."}
              </p>
            )}
            <button
              disabled={patMutation.isPending || !serviceToken}
              type="submit"
              className="btn btn-primary self-end mt-2"
            >
              {patMutation.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Validating…
                </>
              ) : tokenAlreadySet ? (
                "Update service token"
              ) : (
                "Save service token"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const OrgSettingsPage = () => {
  const { org } = useParams({ strict: false })
  const { isTeacher } = useCourseTeacherAccess(org ?? "")

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] xl:px-50">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Organization-level configuration for{" "}
              <span className="font-mono font-semibold">{org}</span>.
            </p>
          </div>
          <OrgSettingsPane />
        </DrawerContent>
        <DrawerSidebar
          page="classes"
          settings
          selected="settings"
          isTeacher={isTeacher}
        />
      </Drawer>
    </div>
  )
}

export default OrgSettingsPage
