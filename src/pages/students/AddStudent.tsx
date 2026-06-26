import { Mail, UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import useEnsureTeam from "@/hooks/useEnsureTeam"
import { githubKeys, invalidateInviteQueries } from "@/hooks/github/queries"
import { enrollStudentInClassroom } from "@/hooks/github/mutations"
import { inviteStudentByEmail } from "@/api/mutations/students"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { isValidEmail } from "@/util/onboarding"

type AddStudentProps = {
  className?: string
  org: string
  classroom: string
}

type AddStudentFormValues = {
  name: string
  username: string
  email: string
}

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return { first_name: parts.at(0), last_name: parts.slice(1).join(" ") }
}

// Single add/invite form. The teacher provides any of name, GitHub username,
// and email. When a username is given we enroll via GitHub (resolve the user,
// add to team, send the org invite) and still store the email on the row; with
// only an email we send an email invite. Either way the student completes their
// roster row (name/email) through onboarding.
const AddStudent = ({ className = "", org, classroom }: AddStudentProps) => {
  const { team } = useEnsureTeam(org, classroom)
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()
  const [warning, setWarning] = useState("")

  const invalidateRoster = () => {
    queryClient.invalidateQueries({
      queryKey: githubKeys.csvFile(
        org,
        "classroom50",
        `${classroom}/students.csv`,
      ),
    })
    invalidateInviteQueries(queryClient, org)
  }

  const addMutation = useMutation({
    mutationFn: async (value: AddStudentFormValues) => {
      const { first_name, last_name } = splitName(value.name)
      const username = value.username.trim()
      const email = value.email.trim()

      // Username present -> GitHub enrolment (carry the email onto the row).
      if (username) {
        const result = await enrollStudentInClassroom(githubClient, {
          org,
          classroom,
          username,
          first_name,
          last_name,
          email: email || undefined,
        })
        return result?.teamWarning ?? ""
      }

      // Email-only -> email invite.
      const result = await inviteStudentByEmail(githubClient, {
        org,
        classroom,
        email,
        first_name,
        last_name,
      })
      return result?.inviteWarning ?? ""
    },
    onSuccess: (warningMessage) => {
      setWarning(warningMessage)
      invalidateRoster()
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      username: "",
      email: "",
    } satisfies AddStudentFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof AddStudentFormValues, string>> = {}
        const username = value.username.trim()
        const email = value.email.trim()

        if (!username && !email) {
          errors.username = "Enter a GitHub username or an email."
        }
        if (email && !isValidEmail(email)) {
          errors.email = "Enter a valid email address."
        }

        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setWarning("")
      await addMutation.mutateAsync(value)
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
          <p className="font-bold mb-2">Add Student</p>
          <p className="text-xs text-base-content/60 mb-2">
            Enter a GitHub username, an email, or both. Students complete their
            details when they enroll.
          </p>

          {warning && (
            <div className="alert alert-warning alert-soft mb-2 text-sm">
              {warning}
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
                  className="input w-full"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="username">
            {(field) => (
              <div className="mb-2">
                <div className="flex">
                  <GitHub className="size-6 mr-2 text-[#ddd] opacity-25" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="github-username"
                    className="input w-full"
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-error text-sm mt-1">
                    {field.state.meta.errors[0]}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="email">
            {(field) => (
              <div className="mb-4">
                <div className="flex">
                  <Mail className="size-6 mr-2 text-[#bbb]" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="student@university.edu (optional)"
                    className="input w-full"
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-error text-sm mt-1">
                    {field.state.meta.errors[0]}
                  </p>
                )}
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

export default AddStudent
