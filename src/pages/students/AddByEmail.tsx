import { Mail, UserRound } from "lucide-react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import useEnsureTeam from "@/hooks/useEnsureTeam"
import { githubKeys, invalidateInviteQueries } from "@/hooks/github/queries"
import { inviteStudentByEmail } from "@/api/mutations/students"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { isValidEmail } from "@/util/onboarding"

type AddByEmailProps = {
  className?: string
  org: string
  classroom: string
}
type AddByEmailFormValues = {
  name: string
  email: string
}

// Email-first enrolment: when the teacher only knows the student's email (not
// their GitHub username), commit an email-only roster row and fire a GitHub org
// email-invite. The student later self-reports their GitHub identity via the
// onboarding flow, and the teacher reconciles it into the roster.
const AddByEmail = ({ className = "", org, classroom }: AddByEmailProps) => {
  const { team } = useEnsureTeam(org, classroom)
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()
  const [inviteWarning, setInviteWarning] = useState("")

  const inviteMutation = useMutation({
    mutationFn: ({
      email,
      first_name,
      last_name,
    }: {
      email: string
      first_name?: string
      last_name?: string
    }) =>
      inviteStudentByEmail(githubClient, {
        org,
        classroom,
        email,
        first_name,
        last_name,
      }),
    onSuccess: (result) => {
      setInviteWarning(result?.inviteWarning ?? "")
      queryClient.invalidateQueries({
        queryKey: githubKeys.csvFile(
          org,
          "classroom50",
          `${classroom}/students.csv`,
        ),
      })
      // Refresh invite/member lists so the new email row shows "Pending invite".
      invalidateInviteQueries(queryClient, org)
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
    } satisfies AddByEmailFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof AddByEmailFormValues, string>> = {}
        if (!value.email.trim()) {
          errors.email = "Email is required."
        } else if (!isValidEmail(value.email)) {
          errors.email = "Enter a valid email address."
        }

        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setInviteWarning("")
      const nameParts = value.name.split(" ")
      const first_name = nameParts.at(0)
      const last_name = nameParts.at(-1)
      await inviteMutation.mutateAsync({
        email: value.email.trim(),
        first_name,
        last_name,
      })
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
          <p className="font-bold mb-2">Invite by Email</p>

          <p className="text-xs text-base-content/60 mb-2">
            The student can only accept if this email is verified on their
            GitHub account.
          </p>

          {inviteWarning && (
            <div className="alert alert-warning alert-soft mb-2 text-sm">
              {inviteWarning}
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

          <form.Field name="email">
            {(field) => (
              <div className="mb-4">
                <div className="flex">
                  <Mail className="size-6 mr-2 text-[#bbb]" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="student@university.edu"
                    className="input"
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
                {!isSubmitting ? "+ Send Invite" : "Submitting..."}
              </button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  )
}

export default AddByEmail
