import { useMutation } from "@tanstack/react-query"

import {
  createClassroomFilesWithConflictRetry,
  type CreateClassroomInput,
  type CreateClassroomResult,
} from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { GitHubAPIError } from "@/hooks/github/errors"

import AutogradingTestsPane from "@/pages/assignments/AutogradingTestsPane"
import Breadcrumb from "@/components/breadcrumb"
import CreateAssignmentForm from "@/pages/assignments/CreateAssignmentForm"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"

const CreateAssignmentPage = () => {
  const client = useGitHubClient()
  const createClassroomMutation = useMutation<
    CreateClassroomResult,
    GitHubAPIError,
    CreateClassroomInput
  >({
    mutationFn: (input) => createClassroomFilesWithConflictRetry(client, input),
    onError: (err) => {
      if (err instanceof GitHubAPIError) {
        switch (err.status) {
          case 409:
            // conflict
            break
          case 404:
            // not found
            break
          case 422:
            // validation
            break
          default:
            // unspecified
            break
        }
      } else {
        console.error("non-GitHub API error:", err)
      }
    },
  })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="New Assignment" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">
                Create Assignment
              </h1>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-8">
              <CreateAssignmentForm />
            </div>
            <AutogradingTestsPane />
            <div className="divider" />
            <div className="flex justify-end gap-2">
              <button className="btn">Cancel</button>
              <button className="btn btn-primary">Create Assignment</button>
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default CreateAssignmentPage
