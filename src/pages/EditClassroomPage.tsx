import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { Link, useParams } from "@tanstack/react-router"
import EditClassroomForm from "./classes/EditClassroomForm"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { GitHubAPIError } from "@/hooks/github/errors"
import { useState } from "react"
import { githubKeys } from "@/hooks/github/queries"
import useGetClassroom from "@/hooks/useGetClassroom"
import { editClassroom } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const EditClassroomPage = () => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { org, classroom } = useParams({ strict: false })
  const { data: cl, isLoading: loadingClassroom } = useGetClassroom(
    org,
    classroom,
  )
  const [classroomEdited, setClassroomEdited] = useState(false)

  const editClassroomMutation = useMutation<
    EditClassroomResult,
    GitHubAPIError,
    EditClassroomInput
  >({
    mutationFn: (input) => editClassroom(client, input),
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.rawFile(org, "classroom50", `/`),
      })
      setClassroomEdited(true)
    },
  })

  if (loadingClassroom) {
    return (
      <div className="flex">
        <div className="m-auto loading loading-spinner" />
      </div>
    )
  }

  if (!cl) {
    return (
      <div className="alert alert-error">Could not load classroom data.</div>
    )
  }

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Edit Classroom" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">Edit Classroom</h1>
            </div>
          </div>
          {classroomEdited ? (
            <div className="alert alert-success mb-4">
              <div>
                Your classroom has been edited successfully. Click{" "}
                <Link className="underline" to={`/${org}/${classroom}`}>
                  here
                </Link>{" "}
                to view your new classroom.
              </div>
            </div>
          ) : (
            <></>
          )}
          <div className="flex flex-col">
            <div className="mb-8">
              <EditClassroomForm
                cl={cl}
                onSubmit={(values) => {
                  editClassroomMutation.mutateAsync({
                    name: values.name,
                    slug: classroom,
                    org,
                    term: values.term,
                  })
                }}
              />
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="classes" page="classes" />
      </Drawer>
    </div>
  )
}

export default EditClassroomPage
