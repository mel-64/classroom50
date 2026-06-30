import { useMemo, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Info,
  UserPlus,
  X,
} from "lucide-react"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import RequireTeacher from "@/components/RequireTeacher"
import Avatar from "@/components/avatar"
import GitHub from "@/assets/github.svg?react"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import {
  useToast,
  type NotifyInput,
} from "@/context/notifications/NotificationProvider"
import { useGitHubViewer } from "@/hooks/github/hooks"
import { githubKeys, invalidateInviteQueries } from "@/hooks/github/queries"
import useOrgMembersOverview from "@/hooks/useOrgMembersOverview"
import type { OrgMemberRow } from "@/util/orgMembers"
import { isSameGitHubUser } from "@/util/students"
import { removeMemberFromOrg } from "@/pages/orgMembers/removeMemberFromOrg"
import { inviteMemberToOrg } from "@/pages/orgMembers/inviteMemberToOrg"
import type { GitHubClient } from "@/hooks/github/client"

// Shared invite flow for the inline button and the detail drawer. Errors are
// toasted here so both call sites only track their own in-flight flag.
const runInviteMember = async (
  client: GitHubClient,
  org: string,
  row: OrgMemberRow,
  notify: (input: NotifyInput) => void,
  onDone: () => void,
) => {
  const label = row.username || row.email
  try {
    const result = await inviteMemberToOrg(client, { org, row })
    const who = result.currentUsername ? `@${result.currentUsername}` : label
    notify({
      tone: "success",
      durationMs: 6000,
      message: `Invited ${who} to the ${org} organization.`,
    })
    onDone()
  } catch (err) {
    notify({
      tone: "error",
      message: `Couldn't invite ${label}: ${
        err instanceof Error ? err.message : "something went wrong"
      }`,
    })
  }
}

// First initial of a row's best display string, for the avatar fallback.
const initialsFor = (row: OrgMemberRow) =>
  (row.name || row.username || row.email || "?")[0]?.toUpperCase() ?? "?"

// GitHub identity line: makes it explicit these are GitHub members by showing
// the @username and the immutable numeric GitHub id together.
const GitHubIdentity = ({ row }: { row: OrgMemberRow }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-base-content/50">
    <GitHub className="size-3.5 opacity-50" />
    {row.username ? (
      <span className="font-mono">@{row.username}</span>
    ) : (
      <span className="italic">no GitHub username</span>
    )}
    {row.github_id ? (
      <span className="text-base-content/40">· id {row.github_id}</span>
    ) : null}
  </span>
)

const ClassificationBadge = ({ row }: { row: OrgMemberRow }) => {
  if (row.classification === "on-roster-not-member") {
    return (
      <span className="badge badge-sm badge-error badge-soft gap-1">
        <AlertTriangle className="size-3" /> Not an org member
      </span>
    )
  }
  if (row.classification === "member-no-roster") {
    return (
      <span className="badge badge-sm badge-ghost gap-1">
        <Info className="size-3" /> No classroom
      </span>
    )
  }
  return <span className="badge badge-sm badge-success badge-soft">Member</span>
}

const MemberDetail = ({
  org,
  row,
  isSelf,
  onClose,
  onRemoved,
}: {
  org: string
  row: OrgMemberRow
  isSelf: boolean
  onClose: () => void
  onRemoved: () => void
}) => {
  const client = useGitHubClient()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [inviting, setInviting] = useState(false)
  const label = row.username || row.email
  // Only non-archived classrooms are actually unenrolled (archived ones can't
  // be; removeMemberFromOrg skips them), so the confirm copy counts those.
  const activeClassrooms = row.classrooms.filter((c) => !c.archived)

  const handleInvite = async () => {
    if (inviting) return
    setInviting(true)
    try {
      await runInviteMember(client, org, row, notify, onRemoved)
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async () => {
    if (working) return
    setWorking(true)
    try {
      const result = await removeMemberFromOrg(client, { org, row })
      if (result.warnings.length > 0) {
        notify({
          tone: "warning",
          durationMs: 8000,
          message: result.warnings.join(" "),
        })
      } else {
        notify({
          tone: "success",
          durationMs: 6000,
          message: `${label} was removed from the ${org} organization${
            result.unenrolledClassrooms.length
              ? ` and unenrolled from ${result.unenrolledClassrooms.length} classroom${
                  result.unenrolledClassrooms.length === 1 ? "" : "s"
                }`
              : ""
          }.`,
        })
      }
      onRemoved()
    } catch (err) {
      notify({
        tone: "error",
        message: `Couldn't remove ${label}: ${
          err instanceof Error ? err.message : "something went wrong"
        }`,
      })
    } finally {
      setWorking(false)
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-base-100 shadow-xl">
        <div className="flex items-center justify-between border-b border-base-300 px-6 py-4">
          <h2 className="text-lg font-semibold">Member details</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <Avatar
            name={row.name || label}
            github={row.username}
            initials={initialsFor(row)}
            subtitle={<GitHubIdentity row={row} />}
          />

          <div className="flex items-center gap-2">
            <ClassificationBadge row={row} />
            {row.email ? (
              <span className="text-sm text-base-content/60">{row.email}</span>
            ) : null}
          </div>

          <a
            href={`https://github.com/orgs/${org}/people${
              row.username ? `?query=${encodeURIComponent(row.username)}` : ""
            }`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Manage on GitHub
          </a>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Classroom access</h3>
            {row.classrooms.length === 0 ? (
              <p className="text-sm text-base-content/60">
                Not on any classroom roster.
              </p>
            ) : (
              <ul className="divide-y divide-base-300 rounded-box border border-base-300">
                {row.classrooms.map((access) => (
                  <Link
                    key={access.classroom}
                    to="/$org/$classroom"
                    params={{ org, classroom: access.classroom }}
                    onClick={onClose}
                    className="clickable-row group/cls flex items-center justify-between px-3 py-2 text-sm first:rounded-t-box last:rounded-b-box"
                  >
                    <span className="font-medium">
                      {access.classroom}
                      {access.archived ? (
                        <span className="badge badge-xs badge-ghost ml-2">
                          archived
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-base-content/60">
                      {access.section ? (
                        <span className="badge badge-xs badge-ghost">
                          {access.section}
                        </span>
                      ) : null}
                      {access.enrollment_status || "—"}
                      <ChevronRight className="size-4 text-base-content/30 transition-transform duration-150 group-hover/cls:translate-x-0.5 group-hover/cls:text-base-content/60" />
                    </span>
                  </Link>
                ))}
              </ul>
            )}
          </div>

          {isSelf ? (
            <div className="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
              This is your signed-in account, so it can&apos;t be removed from
              the organization here.
            </div>
          ) : !row.isMember ? (
            row.github_id ? (
              <div className="rounded-box border border-warning/30 bg-warning/5 p-4 text-sm">
                <p className="text-base-content/80">
                  {label} is on a classroom roster but is{" "}
                  <span className="font-semibold">
                    not an organization member
                  </span>
                  . Invite them to restore their access. The invite is sent to
                  their GitHub account by id, so it works even if their username
                  changed.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-3"
                  disabled={inviting}
                  onClick={() => void handleInvite()}
                >
                  {inviting ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Inviting...
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-4" />
                      Invite to organization
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
                This student is on a roster but is not an organization member.
                They have no GitHub id on file yet, so invite them from their
                classroom&apos;s Students page.
              </div>
            )
          ) : confirming ? (
            <div className="rounded-box border border-error/30 bg-error/5 p-4 text-sm">
              <p className="text-base-content/80">
                {activeClassrooms.length > 0 ? (
                  <>
                    {label} will first be unenrolled from{" "}
                    <span className="font-semibold">
                      {activeClassrooms.length} classroom
                      {activeClassrooms.length === 1 ? "" : "s"}
                    </span>{" "}
                    ({activeClassrooms.map((c) => c.classroom).join(", ")}),
                    then removed from the{" "}
                    <span className="font-semibold">{org}</span> organization.
                    Their assignment repositories are not deleted.
                  </>
                ) : (
                  <>
                    {label} will be removed from the{" "}
                    <span className="font-semibold">{org}</span> organization.
                  </>
                )}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={working}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-sm text-white"
                  disabled={working}
                  onClick={() => void handleRemove()}
                >
                  {working ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Removing...
                    </>
                  ) : (
                    "Remove from organization"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-error btn-outline btn-sm self-start"
              onClick={() => setConfirming(true)}
            >
              Remove from organization
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const OrgMembersPage = () => {
  const { org } = useParams({ strict: false })
  const client = useGitHubClient()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const { data: viewer } = useGitHubViewer()
  const { rows, isLoading, isError, notes } = useOrgMembersOverview(org)
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [invitingKey, setInvitingKey] = useState<string | null>(null)

  const refresh = (affected?: OrgMemberRow) => {
    if (!org) return
    queryClient.invalidateQueries({ queryKey: githubKeys.orgMembersAll(org) })
    invalidateInviteQueries(queryClient, org)
    // removeMemberFromOrg rewrites each affected classroom's students.csv, which
    // the aggregation reads via csvFileQuery; invalidate those (and the
    // classroom.json) so the page doesn't show a just-removed student as still
    // enrolled until the 5-minute staleTime elapses.
    for (const access of affected?.classrooms ?? []) {
      queryClient.invalidateQueries({
        queryKey: githubKeys.csvFile(
          org,
          "classroom50",
          `${access.classroom}/students.csv`,
        ),
      })
      queryClient.invalidateQueries({
        queryKey: githubKeys.jsonFile(
          org,
          "classroom50",
          `${access.classroom}/classroom.json`,
        ),
      })
    }
  }

  // Inline row invite for an on-roster non-member (mirrors the detail-drawer
  // action). Invites by github_id so a stale username doesn't matter.
  const handleQuickInvite = async (row: OrgMemberRow) => {
    if (!org || invitingKey) return
    setInvitingKey(row.key)
    try {
      await runInviteMember(client, org, row, notify, () => refresh(row))
    } finally {
      setInvitingKey(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.username, row.name, row.email].some((field) =>
        field.toLowerCase().includes(q),
      ),
    )
  }, [rows, query])

  const selected = useMemo(
    () => rows.find((row) => row.key === selectedKey) ?? null,
    [rows, selectedKey],
  )
  const discrepancyCount = useMemo(
    () =>
      rows.filter((row) => row.classification === "on-roster-not-member")
        .length,
    [rows],
  )

  const isSelf = (row: OrgMemberRow) =>
    isSameGitHubUser(viewer ?? null, {
      github_id: row.github_id,
      username: row.username,
    })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] xl:px-50">
          <RequireTeacher allow="owner">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Members</h1>
              <p className="mt-1 text-sm text-base-content/60">
                Everyone in the{" "}
                <span className="font-mono font-semibold">{org}</span> GitHub
                organization and the classrooms they belong to.
              </p>
              <a
                href={`https://github.com/orgs/${org}/people`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Manage organization members on GitHub
              </a>
            </div>

            {notes.length > 0 ? (
              <div className="alert alert-warning alert-soft mt-6 text-sm">
                <span>{notes.join(" ")}</span>
              </div>
            ) : null}

            {discrepancyCount > 0 ? (
              <div className="alert alert-error alert-soft mt-6 text-sm">
                <AlertTriangle className="size-4" />
                <span>
                  {discrepancyCount} student
                  {discrepancyCount === 1 ? " is" : "s are"} on a roster but not
                  an organization member.
                </span>
              </div>
            ) : null}

            <div className="mt-6">
              <input
                type="search"
                className="input input-bordered w-full max-w-sm"
                placeholder="Search by name, username, or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-4 card card-border w-full overflow-hidden bg-base-100 shadow-sm">
              {isLoading ? (
                <div className="flex items-center justify-center gap-3 px-6 py-12 text-base-content/50">
                  <span className="loading loading-spinner loading-md" />
                  <span className="text-sm">Loading members...</span>
                </div>
              ) : isError ? (
                <div className="px-6 py-10 text-center text-sm text-error">
                  Couldn&apos;t load organization members.
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-base-content/50">
                  No members match your search.
                </div>
              ) : (
                <ul className="divide-y divide-base-300">
                  {filtered.map((row) => (
                    <li
                      key={row.key}
                      className="clickable-row group/row flex items-center justify-between gap-4 px-6 py-4"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedKey(row.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedKey(row.key)
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <Avatar
                          name={row.name || row.username || row.email}
                          github={row.username}
                          initials={initialsFor(row)}
                          subtitle={<GitHubIdentity row={row} />}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {row.classification === "on-roster-not-member" &&
                        row.github_id ? (
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            disabled={invitingKey === row.key}
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleQuickInvite(row)
                            }}
                          >
                            {invitingKey === row.key ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <>
                                <UserPlus className="size-3.5" />
                                Invite
                              </>
                            )}
                          </button>
                        ) : null}
                        <span className="hidden text-xs text-base-content/50 sm:inline">
                          {row.classrooms.length} classroom
                          {row.classrooms.length === 1 ? "" : "s"}
                        </span>
                        <ClassificationBadge row={row} />
                        <ChevronRight className="size-4 text-base-content/30 transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-base-content/60" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </RequireTeacher>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="members" />
      </Drawer>

      {selected && org ? (
        <MemberDetail
          org={org}
          row={selected}
          isSelf={isSelf(selected)}
          onClose={() => setSelectedKey(null)}
          onRemoved={() => {
            setSelectedKey(null)
            refresh(selected)
          }}
        />
      ) : null}
    </div>
  )
}

export default OrgMembersPage
