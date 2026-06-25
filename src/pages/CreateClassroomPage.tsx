import { Link, useParams } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { createClassroomFilesWithConflictRetry } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { GitHubAPIError } from "@/hooks/github/errors"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import Breadcrumb from "@/components/breadcrumb"
import MissingParams from "@/components/MissingParams"
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
  const { org } = useParams({ strict: false })
  const [classroomCreated, setClassroomCreated] = useState(false)
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.rawFile(org ?? "", "classroom50", `/`),
      })
      setClassroomCreated(true)
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
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">Create Classroom</h1>
            </div>
          </div>
          {classroomCreated ? (
            <div className="alert alert-success mb-4">
              <div>
                Your classroom has been created. Click{" "}
                <Link
                  className="underline"
                  to="/$org/$classroom"
                  params={{ org, classroom: classroomSlug }}
                >
                  here
                </Link>{" "}
                to view your new classroom; please note it may take a minute or
                two for the new class to show up.
              </div>
            </div>
          ) : (
            <></>
          )}
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

export default CreateClassroomPage
