import { UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useForm } from "@tanstack/react-form"
import useGetOrgMembers from "@/hooks/useGetOrgMembers"
import { useMutation } from "@tanstack/react-query"

type AddByGithubUsernameProps = {
  className?: string
  org: string
  classroom: string
}
type AddStudentFormValues = {
  name: string
  username: string
}
const AddByGithubUsername = ({
  className = "",
  org,
  classroom,
}: AddByGithubUsernameProps) => {
  const { data: members } = useGetOrgMembers(org)
  const addStudentMutation = useMutation({})
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
    <div className={`card card-border w-96 bg-base-100 shadow-sm ${className}`}>
      <form>
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
                disabled={!canSubmit || isSubmitting}
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
