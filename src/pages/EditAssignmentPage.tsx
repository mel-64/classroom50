import { useState } from "react"
import { Link, useParams, useRouter } from "@tanstack/react-router"
import { UsersRound } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetAssignmentRepo from "@/hooks/useGetAssignmentRepo"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"

import GitHub from "@/assets/github.svg?react"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { GroupCollaboratorsModal } from "@/components/modals/GroupCollaboratorsModal"
import EditAssignmentForm from "./assignments/EditAssignmentForm"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"

const EditAssignmentFormStudent = ({
  org,
  classroom,
  assignment,
}: {
  org: string
  classroom: string
  assignment: string
}) => {
  const { user } = useGithubAuth()
  const { isLoading: loadingPublic, assignment: assignmentData } =
    useGetPublicAssignment(org, classroom, assignment)
  const { isLoading: loadingRepo, assignment: assignmentRepo } =
    useGetAssignmentRepo(org, classroom, assignment, user?.login)

  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)

  // max_group_size includes the owner, so the addable count is one less.
  const maxCollaborators = Math.max(
    (assignmentData?.max_group_size ?? 1) - 1,
    0,
  )
  const assignmentMode = assignmentData?.mode

  if (loadingPublic || loadingRepo) {
    return (
      <div className="flex">
        <div className="loading loading-spinner m-auto" />
      </div>
    )
  }

  if (!assignmentRepo) {
    return (
      <div className="alert alert-warning mt-6">
        <div>
          You do not have this assignment yet! Do you need to{" "}
          <Link
            className="underline"
            to="/$org/$classroom/assignments/$assignment/accept"
            params={{ org, classroom, assignment }}
          >
            accept it
          </Link>{" "}
          first?
        </div>
      </div>
    )
  }

  if (assignmentMode === "individual") {
    return (
      <div className="alert alert-warning mt-6">
        This is an individual assignment. There is nothing available to edit as
        a Student at this time.
      </div>
    )
  }

  return (
    <>
      <div className="card mb-6 w-full border border-base-200 bg-base-100 shadow-sm">
        <div className="card-body gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UsersRound className="size-6" />
            </div>

            <div>
              <h1 className="card-title text-xl">{assignmentData?.name}</h1>
              <p className="text-sm font-medium text-base-content/60">
                Group members
              </p>
              <a
                className="link mt-1 inline-flex items-center gap-1.5 text-sm"
                href={assignmentRepo.html_url}
                target="_blank"
                rel="noreferrer"
              >
                <GitHub className="size-4" />
                View repository
              </a>
              <p className="mt-2 text-sm text-base-content/70">
                Add or remove collaborators for this assignment repository. This
                assignment allows up to{" "}
                <span className="font-semibold text-base-content">
                  {maxCollaborators}
                </span>{" "}
                student{maxCollaborators === 1 ? "" : "s"} in addition to the
                group owner.
              </p>
            </div>
          </div>

          <div className="card-actions justify-end border-t border-base-200 pt-6">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCollaboratorsOpen(true)}
            >
              <UsersRound className="size-4" />
              Manage collaborators
            </button>
          </div>
        </div>
      </div>

      {user?.login && (
        <GroupCollaboratorsModal
          open={collaboratorsOpen}
          onClose={() => setCollaboratorsOpen(false)}
          org={org}
          repoName={assignmentRepo.name}
          repoUrl={assignmentRepo.html_url}
          ownerLogin={user.login}
          assignmentName={assignmentData?.name}
          maxGroupSize={assignmentData?.max_group_size}
        />
      )}
    </>
  )
}

const EditAssignmentPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const router = useRouter()
  const { isTeacher, isStudent } = useCourseTeacherAccess(org)
  const { data: assignments } = useGetClassroomAssignments(org, classroom)
  const [editSuccess, setEditSuccess] = useState(false)
  const [editWarning, setEditWarning] = useState("")
  const [editError, setEditError] = useState("")

  const assignmentData = assignments?.assignments.find(
    (a) => a.slug === assignment,
  )

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Edit Assignment" />
          {editError && (
            <div className="alert alert-error mt-6">{editError}</div>
          )}
          {editSuccess && (
            <div className="alert alert-success mt-6">
              Your assignment has been edited successfully!
            </div>
          )}
          {editWarning && (
            <div className="alert alert-warning mt-6">{editWarning}</div>
          )}
          <h1 className="text-2xl font-bold mt-4 mb-6">Edit Assignment</h1>
          {isTeacher && org && classroom && assignment && (
            <EditAssignmentForm
              org={org}
              classroom={classroom}
              assignment={assignment}
              defaultData={assignmentData}
              onCancel={() => {
                router.history.back()
              }}
              onMutate={() => {
                // Clear prior banners so a re-edit never shows stale state.
                setEditSuccess(false)
                setEditWarning("")
                setEditError("")
              }}
              onError={(error) => {
                setEditError(error.message)
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              onSuccess={(result) => {
                // Surface a non-fatal template-grant warning inline if
                // present; otherwise show the success banner.
                if (result?.templateGrantWarning) {
                  setEditWarning(result.templateGrantWarning)
                } else {
                  setEditSuccess(true)
                  setTimeout(() => setEditSuccess(false), 3000)
                }
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
            />
          )}
          {isStudent && org && classroom && assignment && (
            <EditAssignmentFormStudent
              org={org}
              classroom={classroom}
              assignment={assignment}
            />
          )}
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default EditAssignmentPage
