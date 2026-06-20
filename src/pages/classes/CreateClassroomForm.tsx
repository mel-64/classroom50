import useGetClasses from "@/hooks/useGetClasses"
import { useForm } from "@tanstack/react-form"
import { useParams } from "@tanstack/react-router"
import { useState } from "react"

export type CreateClassroomFormValues = {
  name: string
  slug: string
  term: string
}

type CreateClassroomFormProps = {
  defaultValues?: Partial<CreateClassroomFormValues>
  onSubmit: (values: CreateClassroomFormValues) => void | Promise<void>
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const CreateClassroomForm = ({
  defaultValues,
  onSubmit,
}: CreateClassroomFormProps) => {
  const { org = "" } = useParams({ strict: false })
  const { classes } = useGetClasses(org)
  const [submitted, setSubmitted] = useState(false)

  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      slug: defaultValues?.slug ?? "",
      term: defaultValues?.slug ?? "",
    } satisfies CreateClassroomFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof CreateClassroomFormValues, string>> =
          {}
        if (!value.name.trim()) {
          errors.name = "Classroom name is required."
        }

        if (!value.slug.trim()) {
          errors.slug = "Classroom slug is required."
        }

        if (classes.find((cl) => cl.path === value.slug.trim())) {
          errors.slug = "Classroom slug is already taken."
        }

        return Object.keys(errors).length > 0
          ? {
              fields: errors,
            }
          : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        slug: slugify(value.slug),
        term: value.term.trim(),
      })
      setSubmitted(true)
    },
  })
  return (
    <form
      className="card bg-base-100 w-full shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="card-body">
        <h3 className="text-lg font-bold pb-4">Basic Information</h3>

        <form.Field name="name">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Name<span className="text-[#f00]">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., AP CS Principles"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                  form.setFieldValue("slug", slugify(e.target.value))
                }}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <form.Field name="slug">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Slug<span className="text-[#f00]">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., ap-cs-principles"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <form.Field name="term">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Term
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., Fall 2026"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <div className="card-actions justify-end p-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting || submitted}
              >
                {isSubmitting ? "Creating..." : "Create Classroom"}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}

export default CreateClassroomForm
