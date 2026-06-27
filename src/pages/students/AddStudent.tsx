import { Mail, UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { revalidateLogic, useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import useEnsureTeam from "@/hooks/useEnsureTeam"
import { invalidateInviteQueries } from "@/hooks/github/queries"
import { useUpdateRosterCache } from "@/hooks/useGetStudents"
import { enrollStudentInClassroom } from "@/hooks/github/mutations"
import { inviteStudentByEmail } from "@/api/mutations/students"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { isValidEmail } from "@/util/onboarding"
import { splitName, toStudent } from "@/util/roster"

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

// Single add/invite form. The teacher provides any of name, GitHub username,
// and email. When a username is given we enroll via GitHub (resolve the user,
// add to team, send the org invite) and still store the email on the row; with
// only an email we send an email invite. Either way the student completes their
// roster row (name/email) through onboarding.
const AddStudent = ({ className = "", org, classroom }: AddStudentProps) => {
  const { team } = useEnsureTeam(org, classroom)
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()
  const updateRosterCache = useUpdateRosterCache(org, classroom)
  const [warning, setWarning] = useState("")
  const [success, setSuccess] = useState("")

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
        return {
          label: username,
          warning: result?.teamWarning ?? "",
          student: toStudent(result.student),
        }
      }

      // Email-only -> email invite. A unique per-student invite token is always
      // minted, so the secure per-student onboarding link is available from the
      // roster regardless; the shared classroom-wide link also works.
      const result = await inviteStudentByEmail(githubClient, {
        org,
        classroom,
        email,
        first_name,
        last_name,
      })
      return {
        label: email,
        warning: result?.inviteWarning ?? "",
        student: toStudent(result.student),
      }
    },
    onSuccess: ({ label, warning: warningMessage, student }) => {
      setWarning(warningMessage)
      // Confirm the add and clear the form so the next student starts clean
      // (and a stray re-click can't resubmit the same row into a duplicate
      // error). A non-fatal warning still shows alongside the confirmation.
      setSuccess(`Added ${label}.`)
      form.reset()
      // Show the new row immediately. GitHub's Contents API can still serve the
      // pre-commit students.csv for a few seconds, so an invalidate-driven
      // refetch alone would leave the roster looking unchanged until refresh.
      updateRosterCache((current) => [...current, student])
      invalidateInviteQueries(queryClient, org)
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      username: "",
      email: "",
    } satisfies AddStudentFormValues,
    // Validate on submit, then re-validate on every change after the first
    // submit attempt. Without this, a failed form-level validation leaves
    // canSubmit=false and the form-level validator never re-runs on change, so
    // the disabled submit button never recovers (the form is dead until
    // remount). onDynamic runs in both phases under revalidateLogic.
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
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
      setSuccess("")
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

          {success && (
            <div className="alert alert-success alert-soft mb-2 text-sm">
              {success}
            </div>
          )}

          <form.Field name="name">
            {(field) => (
              <div className="flex mb-2 items-center">
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
                <div className="flex items-center">
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
                    {String(field.state.meta.errors[0] ?? "")}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="email">
            {(field) => (
              <div className="mb-4">
                <div className="flex items-center">
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
                    {String(field.state.meta.errors[0] ?? "")}
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
