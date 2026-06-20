import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"

import Breadcrumb from "@/components/breadcrumb"
import CreateAssignmentForm from "@/pages/assignments/CreateAssignmentForm"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { GitHubAPIError } from "@/hooks/github/errors"
import { createAssignment } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { slugify } from "./classes/CreateClassroomForm"
import { githubKeys } from "@/hooks/github/queries"
import { useState } from "react"
import type {
  CreateAssignmentInput,
  CreateAssignmentResult,
} from "@/api/mutations/assignments"

const CreateAssignmentPage = () => {
  const client = useGitHubClient()
  const navigate = useNavigate()
  const { org, classroom } = useParams({ strict: false })
  const queryClient = useQueryClient()
  const [errorMessage, setErrorMessage] = useState("")

  const createClassroomMutation = useMutation<
    CreateAssignmentResult,
    GitHubAPIError,
    CreateAssignmentInput
  >({
    mutationFn: (input) => createAssignment(client, input),
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
      setErrorMessage(err.message)
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.jsonFile(
          org,
          "classroom50",
          `${classroom}/assignments.json`,
        ),
      })
      navigate({ to: `/${org}/${classroom}/assignments` })
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
          {errorMessage ? (
            <div className="alert alert-error mb-6">{errorMessage}</div>
          ) : (
            <></>
          )}
          <div className="flex flex-col">
            <div className="mb-8">
              <CreateAssignmentForm
                loading={createClassroomMutation.isPending}
                onSubmit={(values) => {
                  setErrorMessage("")
                  createClassroomMutation.mutateAsync({
                    name: values.name,
                    slug: slugify(values.name),
                    mode: values.mode,
                    org,
                    template_repo: values.template_repo,
                    description: values.description,
                    due_date: values.due_date,
                    max_group_size: values.max_group_size,
                    feedback_pr: values.feedback_pr,
                    runs_on: values.runs_on,
                    container_image: values.container_image,
                    container_user: values.container_user,
                    setup_command: values.setup_command,
                    classroom,
                    tests: values.tests,
                  })
                }}
              />
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default CreateAssignmentPage
