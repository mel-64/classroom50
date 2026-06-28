import { useParams, useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { createClassroomFilesWithConflictRetry } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useToast } from "@/context/notifications/NotificationProvider"
import { GitHubAPIError } from "@/hooks/github/errors"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import Breadcrumb from "@/components/breadcrumb"
import MissingParams from "@/components/MissingParams"
import RequireTeacher from "@/components/RequireTeacher"
import CreateClassroomForm from "./classes/CreateClassroomForm"
import { githubKeys } from "@/hooks/github/queries"
import { useState } from "react"
import type {
  CreateClassroomInput,
  CreateClassroomResult,
} from "@/api/mutations/classrooms"

const CreateClassroomPage = () => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useToast()
  const { org } = useParams({ strict: false })
  // Captured in onSubmit so onSuccess can redirect to the created classroom.
  const [classroomSlug, setClassroomSlug] = useState("")

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
      notify({
        tone: "error",
        message: `Couldn't create classroom: ${err.message}`,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.jsonFile(org ?? "", "classroom50"),
      })
      // Success confirmation survives the redirect via a toast (the provider is
      // mounted above the router). GitHub's contents API is read-after-write
      // eventual, so the new classroom may take a moment to appear.
      notify({
        tone: "success",
        durationMs: 6000,
        message: "Classroom created. It may take a moment to appear.",
      })
      navigate({
        to: "/$org/$classroom",
        params: { org: org ?? "", classroom: classroomSlug },
      })
    },
  })

  if (!org) {
    return <MissingParams message="Missing organization." />
  }

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="New Classroom" />
          <RequireTeacher>
            <div className="flex justify-between">
              <div>
                <h1 className="text-xl pt-8 pb-10 font-bold">
                  Create Classroom
                </h1>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="mb-8">
                <CreateClassroomForm
                  onSubmit={(values) => {
                    setClassroomSlug(values.slug)
                    createClassroomMutation.mutateAsync({
                      name: values.name,
                      classroom: values.slug,
                      org,
                      term: values.term,
                      secret: values.secret || undefined,
                    })
                  }}
                />
              </div>
            </div>
          </RequireTeacher>
        </DrawerContent>
        <DrawerSidebar selected="classes" page="classes" />
      </Drawer>
    </div>
  )
}

export default CreateClassroomPage
