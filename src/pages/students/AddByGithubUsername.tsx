import { UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import useEnsureTeam from "@/hooks/useEnsureTeam"
import { githubKeys } from "@/hooks/github/queries"
import { enrollStudentInClassroom } from "@/hooks/github/mutations"
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
 * 1) ensure the team for the classroom exists
 * 2) perform a lookup on the user by their username (required)
 * 3) if they are a valid user and in the org, simply add to CSV roster (including ID)
 * 4) if they are a valid user and not in org, send org invite and add to roster
 * 5) if they are not a valid user, display as much with an error
 */
const AddByGithubUsername = ({
  className = "",
  org,
  classroom,
}: AddByGithubUsernameProps) => {
  const { team } = useEnsureTeam(org, classroom)
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()
  const [teamWarning, setTeamWarning] = useState("")

  const addStudentMutation = useMutation({
    mutationFn: ({ username, first_name, last_name }) =>
      enrollStudentInClassroom(githubClient, {
        org,
        classroom,
        username,
        first_name,
        last_name,
      }),
    onSuccess: (result) => {
      // Surface a non-fatal team-add failure inline (the student is enrolled
      // but lacks private-template read until retried).
      setTeamWarning(result?.teamWarning ?? "")
      queryClient.invalidateQueries({
        queryKey: githubKeys.csvFile(
          org,
          "classroom50",
          `${classroom}/students.csv`,
        ),
      })
      // Enroll sends an org invite, so the new student should show as
      // "Pending invite" — refresh the invitation/member lists that drive the
      // roster status badges (without these, the stale lists show "Not in org").
      queryClient.invalidateQueries({
        queryKey: githubKeys.orgInvitations(org),
      })
      queryClient.invalidateQueries({
        queryKey: githubKeys.orgFailedInvitations(org),
      })
      queryClient.invalidateQueries({
        queryKey: ["orgs", "list", "members", org],
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
      setTeamWarning("")
      const nameParts = value.name.split(" ")
      const first_name = nameParts.at(0)
      const last_name = nameParts.at(-1)
      await addStudentMutation.mutateAsync({ ...value, first_name, last_name })
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

          {teamWarning && (
            <div className="alert alert-warning alert-soft mb-2 text-sm">
              {teamWarning}
            </div>
          )}

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
