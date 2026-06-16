import { useParams, Link } from "@tanstack/react-router"
import {
  BookOpen,
  BookText,
  ExternalLink,
  GraduationCap,
  Plus,
  UsersRound,
} from "lucide-react"
import GitHub from "@/assets/github.svg?react"

import useGetClasses from "@/hooks/useGetClasses"
import useGetStudents from "@/hooks/useGetStudents"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import type { GitHubFileListing } from "@/hooks/github/types"
import useGetClassroom from "@/hooks/useGetClassroom"
import { useEffect } from "react"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { acceptPendingOrgInvite } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import useGetOrgRepos from "@/hooks/useGetMyOrgRepos"
import useDotClassroom50 from "@/hooks/useDotClassroom50"

const ClassCard = ({ cl, org }: { cl: GitHubFileListing; org: string }) => {
  const { data: classroomData } = useGetClassroom(org, cl.path)
  const { students } = useGetStudents(org, cl.path)

  return (
    <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
      <div className="card-body gap-4">
        {classroomData ? (
          <label
            className={`h-6 badge badge-soft ${classroomData?.active ? "badge-success" : "badge-primary"}`}
          >
            {classroomData?.term || "No Term Specified"}
          </label>
        ) : (
          <div className="skeleton w-10 h-6" />
        )}
        {classroomData ? (
          <h1 className="text-xl h-8">
            {classroomData?.name ||
              classroomData?.short_name ||
              "Unknown Class Name"}
          </h1>
        ) : (
          <div className="skeleton h-8 w-40" />
        )}
        {classroomData ? (
          <div className="flex gap-2 h-6">
            <UsersRound />
            {students ? `${students.length} Students` : "No Students"}
          </div>
        ) : (
          <div className="skeleton w-20 h-6" />
        )}
        <Link
          type="button"
          to={`/${org}/${cl.path}/assignments`}
          className="btn btn-outline btn-primary w-full"
        >
          <BookText />
          View Assignments
        </Link>
      </div>
    </div>
  )
}

const CreateClassroomPane = ({ org }) => (
  <div className="card border border-dashed border-base-300 bg-base-100 shadow-sm">
    <div className="card-body items-center py-12 text-center">
      <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Plus className="size-7" />
      </div>

      <h2 className="card-title text-xl">No classrooms yet</h2>

      <p className="max-w-md text-base-content/70">
        Create your first classroom to start adding assignments, importing
        students, and managing submissions.
      </p>

      <div className="card-actions mt-4">
        <Link
          to={`/${org}/classes/new`}
          type="button"
          className="btn btn-primary"
        >
          <Plus className="size-4" />
          Create classroom
        </Link>
      </div>
    </div>
  </div>
)

const JoinOrgCard = ({ org }: { org: string }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => acceptPendingOrgInvite(client, org),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["github", "memberships", "orgs", org],
      })
      queryClient.invalidateQueries({ queryKey: ["orgs"] })
    },
  })

  return (
    <div className="card border border-dashed border-base-300 bg-base-100 shadow-sm">
      <div className="card-body items-center py-12 text-center">
        <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="size-7" />
        </div>

        <h2 className="card-title text-xl">Join this classroom</h2>

        <p className="max-w-md text-base-content/70">
          You have a pending invitation to join{" "}
          <span className="font-medium text-base-content">{org}</span>. Accept
          the invitation to access your classroom assignments.
        </p>

        {mutation.isError ? (
          <div className="alert alert-error mt-4 max-w-md text-left">
            Unable to join the organization. Please try again.
          </div>
        ) : null}

        <div className="card-actions mt-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Plus className="size-4" />
            )}
            {mutation.isPending ? "Joining..." : "Join organization"}
          </button>
        </div>
      </div>
    </div>
  )
}

const RepoCard = ({ org, repo }) => {
  const cl50Yaml = useDotClassroom50(org, repo.name)
  const { classroom } = cl50Yaml

  return (
    <div className="card col-span-12 rounded-2xl border border-base-200 bg-base-100 md:col-span-6 xl:col-span-4">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="size-5" />
              </div>

              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold leading-tight">
                  {repo.name}
                </h3>
                <p className="truncate text-xs text-base-content/50">
                  {repo.owner?.login}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="line-clamp-2 min-h-10 text-sm text-base-content/70">
          {repo.description ||
            "No description provided for this assignment repository."}
        </p>

        {classroom && (
          <div className="alert alert-outline">
            <Link
              to="/$org/$classroom"
              params={{ org, classroom }}
              className="group inline-flex w-fit items-center gap-1.5 text-sm text-base-content/60 transition hover:text-primary"
            >
              <GraduationCap className="size-4" />
              <span className="truncate">
                Classroom:{" "}
                <span className="font-medium text-base-content/80 group-hover:text-primary">
                  {classroom}
                </span>
              </span>
            </Link>
          </div>
        )}

        <div className="card-actions items-center justify-between pt-1">
          <div className="flex flex-wrap gap-2">
            {repo.archived && (
              <div className="badge badge-warning">Archived</div>
            )}
            {repo.disabled && <div className="badge badge-error">Disabled</div>}
            {repo.fork && <div className="badge badge-outline">Fork</div>}
          </div>

          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-primary"
          >
            Open repo
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

export const OrgRepos = ({
  org,
  classroom,
}: {
  org: string
  classroom?: string
}) => {
  const { data: repos } = useGetOrgRepos(org)

  if (!repos) return <></>

  let maintainRepos = repos.filter((repo) => repo.permissions?.maintain)
  if (classroom) {
    maintainRepos = maintainRepos.filter((repo) =>
      repo.name.startsWith(classroom),
    )
  }

  if (maintainRepos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-base-200">
          <BookOpen className="size-6 text-base-content/60" />
        </div>

        <h2 className="text-lg font-semibold">No assignment repos yet</h2>

        <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
          Repositories you can maintain will appear here once assignments have
          been created for this organization.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {maintainRepos.map((repo) => (
        <RepoCard key={repo.id ?? repo.full_name} org={org} repo={repo} />
      ))}
    </div>
  )
}

const ClassesPage = () => {
  const { org } = useParams({ strict: false })
  const { classes } = useGetClasses(org)
  const { isTeacher, isStudent, isBlocked } = useCourseTeacherAccess(org)
  const { data: membership, isLoading: loadingMembership } =
    useGetOwnOrgMembership(org)

  const isMember = membership?.state === "active"

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <div className="mb-8">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <GitHub className="size-5 opacity-70" />

                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                      GitHub Organization
                    </div>
                    <div className="font-mono text-sm font-semibold text-base-content">
                      {org}
                    </div>
                  </div>
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    My {isTeacher ? "Classes" : "Assignments"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-base-content/60">
                    Manage your courses and assignments.
                  </p>
                </div>
              </div>

              {classes.length && isTeacher ? (
                <div className="flex sm:self-end">
                  <Link
                    type="button"
                    to={`/${org}/classes/new`}
                    className="btn btn-primary"
                  >
                    + New Class
                  </Link>
                </div>
              ) : (
                <></>
              )}
            </div>
            {isStudent && !isMember && !loadingMembership ? (
              <JoinOrgCard org={org} />
            ) : (
              <></>
            )}
          </div>
          {classes.length === 0 && isTeacher ? (
            <CreateClassroomPane org={org} />
          ) : null}
          {isTeacher && (
            <div className="grid grid-cols-12 gap-4 mb-6">
              {classes.map((cl) => (
                <ClassCard key={cl.path} cl={cl} org={org} />
              ))}
            </div>
          )}
          {isStudent && isMember && <OrgRepos org={org} />}
        </DrawerContent>
        <DrawerSidebar
          page="classes"
          selected="assignments"
          isTeacher={isTeacher}
        />
      </Drawer>
    </div>
  )
}

export default ClassesPage
