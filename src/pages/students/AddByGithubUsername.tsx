import { UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useForm } from "@tanstack/react-form"
import useGetOrgMembers from "@/hooks/useGetOrgMembers"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import useGetTeam from "@/hooks/useGetTeam"
import { useEffect } from "react"
import useEnsureTeam from "@/hooks/useEnsureTeam"
import { githubKeys } from "@/hooks/github/queries"
import {
  addStudentToClassroom,
  enrollStudentInClassroom,
} from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"

type AddByGithubUsernameProps = {
  className?: string
  org: string
  classroom: string
}
type AddStudentFormValues = {
  name: string
  username: string
}
/**
 * 1) maintain a cache of existing org members to cross-reference
 * 2) ensure the team for the classroom exists
 * 3) perform a lookup on the user by their username (required)
 * 4) if they are a valid user and in the org, simply add to CSV roster (including ID)
 * 5) if they are a valid user and not in org, send org invite and add to roster
 * 6) if they are not a valid user, display as much with an error
 */
const AddByGithubUsername = ({
  className = "",
  org,
  classroom,
}: AddByGithubUsernameProps) => {
  const { members } = useGetOrgMembers(org)
  const { team } = useEnsureTeam(org, classroom)
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()

  const addStudentMutation = useMutation({
    mutationFn: ({ username }) =>
      enrollStudentInClassroom(githubClient, { org, classroom, username }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.csvFile(org, classroom, "students.csv"),
      })
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      username: "",
    } satisfies AddStudentFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof AddStudentFormValues, string>> = {}
        if (!value.username.trim()) {
          errors.username = "GitHub username is required."
        }

        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await addStudentMutation.mutateAsync(value)
    },
  })

  return (
    <div className={`card card-border bg-base-100 shadow-sm ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
      >
        <div className="card-body">
          <p className="font-bold mb-2">Add by GitHub Username</p>

          <form.Field name="name">
            {(field) => (
              <div className="flex mb-2">
                <UserRound className="mr-2 text-[#bbb]" />
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  placeholder="Name (optional)"
                  className="input"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="username">
            {(field) => (
              <div className="flex mb-4">
                <GitHub className="size-6 mr-2 text-[#ddd] opacity-25" />
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  placeholder="github-username"
                  className="input"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting || !team}
                className="btn btn-primary w-full bg-[#4e80ee]"
              >
                {!isSubmitting ? "+ Add Student" : "Submitting..."}
              </button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  )
}

export default AddByGithubUsername
