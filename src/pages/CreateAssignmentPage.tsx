import { useMutation } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"

import Breadcrumb from "@/components/breadcrumb"
import CreateAssignmentForm from "@/pages/assignments/CreateAssignmentForm"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  createAssignment,
  type CreateAssignmentInput,
  type CreateAssignmentResult,
} from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { slugify } from "./classes/CreateClassroomForm"

const CreateAssignmentPage = () => {
  const client = useGitHubClient()
  const navigate = useNavigate()
  const { org, classroom } = useParams({ strict: false })
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
    },
    onSuccess: () => navigate({ to: `/${org}/${classroom}/assignments` }),
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
              <CreateAssignmentForm
                onSubmit={(values) =>
                  createClassroomMutation.mutateAsync({
                    name: values.name,
                    slug: slugify(values.name),
                    mode: values.mode,
                    org,
                    template_repo: values.template_repo,
                    description: values.description,
                    due_date: values.due_date,
                    max_group_size: values.max_group_size,
                    classroom,
                    tests: values.tests,
                  })
                }
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
