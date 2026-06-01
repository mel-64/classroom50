import { useParams } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"

import {
  createClassroomFilesWithConflictRetry,
  type CreateClassroomInput,
  type CreateClassroomResult,
} from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { GitHubAPIError } from "@/hooks/github/errors"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import Breadcrumb from "@/components/breadcrumb"
import CreateClassroomForm from "./classes/CreateClassroomForm"

const CreateClassroomPage = () => {
  const client = useGitHubClient()
  const { org } = useParams({ strict: false })
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
          <Breadcrumb endpoint="New Classroom" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">Create Classroom</h1>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-8">
              <CreateClassroomForm
                onSubmit={(values) =>
                  createClassroomMutation.mutateAsync({
                    name: values.name,
                    classroom: values.slug,
                    org,
                    term: values.term,
                  })
                }
              />
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="classes" page="classes" />
      </Drawer>
    </div>
  )
}

export default CreateClassroomPage
