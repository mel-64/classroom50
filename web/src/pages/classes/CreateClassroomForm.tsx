import useGetClasses from "@/hooks/useGetClasses"
import { useForm } from "@tanstack/react-form"
import { useParams } from "@tanstack/react-router"
import { useState } from "react"
import {
  DEFAULT_SECRET_LENGTH,
  SECRET_PATTERN_DESCRIPTION,
  generateSecret,
  isValidSecret,
} from "@/util/secret"
import { slugify } from "@/util/slug"

export type CreateClassroomFormValues = {
  name: string
  slug: string
  term: string
  // Opt-in: when true the classroom's published resources are served under
  // an unguessable capability-URL secret path segment. Off by default.
  protectPages: boolean
  // The capability-URL secret. Empty when protectPages is false; a generated
  // (editable) value when true. Validated to `[a-z0-9]{4,64}` on submit.
  secret: string
}

type CreateClassroomFormProps = {
  defaultValues?: Partial<CreateClassroomFormValues>
  // Returns the submit's settling promise (or void) so the form can await the
  // real write and only latch its loading state on success.
  onSubmit: (values: CreateClassroomFormValues) => void | Promise<unknown>
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
      protectPages: defaultValues?.protectPages ?? false,
      secret: defaultValues?.secret ?? "",
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

        // Only validate the secret when protection is enabled; a disabled
        // toggle leaves it empty (unprotected, the default).
        if (value.protectPages && !isValidSecret(value.secret.trim())) {
          errors.secret = `Secret must be ${SECRET_PATTERN_DESCRIPTION}.`
        }

        return Object.keys(errors).length > 0
          ? {
              fields: errors,
            }
          : undefined
      },
    },
    onSubmit: async ({ value }) => {
      // Latch `submitted` only on success: a rejected create skips it (the
      // page's mutation onError toasts), so the button re-enables for a retry
      // instead of sticking on "Creating...".
      await onSubmit({
        name: value.name.trim(),
        slug: slugify(value.slug),
        term: value.term.trim(),
        protectPages: value.protectPages,
        // Pass the secret only when protection is on; otherwise empty so the
        // classroom stays at the plain Pages path.
        secret: value.protectPages ? value.secret.trim() : "",
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
                Classroom Name<span className="text-error">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                required
                aria-required="true"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={
                  field.state.meta.errors.length > 0
                    ? `${field.name}-error`
                    : undefined
                }
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
                <p
                  id={`${field.name}-error`}
                  className="text-error text-sm mb-4"
                  role="alert"
                >
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
                Classroom Slug<span className="text-error">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                required
                aria-required="true"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={
                  field.state.meta.errors.length > 0
                    ? `${field.name}-error`
                    : undefined
                }
                className="input w-full mb-4"
                placeholder="e.g., ap-cs-principles"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p
                  id={`${field.name}-error`}
                  className="text-error text-sm mb-4"
                  role="alert"
                >
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
                <p className="text-error text-sm mb-4" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <form.Field name="protectPages">
          {(field) => (
            <div className="mt-2 rounded-box border border-base-200 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary mt-0.5"
                  checked={field.state.value}
                  onChange={(e) => {
                    const on = e.target.checked
                    field.handleChange(on)
                    // Generate a candidate the first time protection is
                    // enabled (and the field is empty) so the teacher sees a
                    // ready-to-use key they can accept or replace. Turning it
                    // off clears the secret so an unprotected classroom never
                    // carries one.
                    if (on) {
                      if (!form.getFieldValue("secret")) {
                        form.setFieldValue(
                          "secret",
                          generateSecret(DEFAULT_SECRET_LENGTH),
                        )
                      }
                    } else {
                      form.setFieldValue("secret", "")
                    }
                  }}
                />
                <span>
                  <span className="font-bold">
                    Use an unlisted link for this classroom
                  </span>
                  <span className="block text-sm text-base-content/70">
                    Publishes this classroom&apos;s assignment data at an
                    unguessable URL instead of one anyone can reach by guessing
                    the org name. This is obscurity, not real access control:
                    anyone who gets the link can read it, and links can leak
                    (browser history, referrers, search crawlers). Off by
                    default.
                  </span>
                </span>
              </label>

              <form.Subscribe selector={(state) => state.values.protectPages}>
                {(protect) =>
                  protect ? (
                    <form.Field name="secret">
                      {(secretField) => (
                        <div className="mt-4">
                          <label
                            htmlFor={secretField.name}
                            className="label font-bold"
                          >
                            Access key
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={secretField.name}
                              name={secretField.name}
                              type="text"
                              className="input w-full font-mono"
                              placeholder="e.g., a1b2c3d4"
                              value={secretField.state.value}
                              onBlur={secretField.handleBlur}
                              onChange={(e) =>
                                secretField.handleChange(e.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() =>
                                secretField.handleChange(
                                  generateSecret(DEFAULT_SECRET_LENGTH),
                                )
                              }
                            >
                              Regenerate
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-base-content/70">
                            {SECRET_PATTERN_DESCRIPTION}. Accept the generated
                            key or type your own. It becomes part of every
                            published URL for this classroom, so treat it like a
                            shared password — anyone who has the link can read
                            the data. It can&apos;t be changed later without
                            re-accepting assignments.
                          </p>
                          {secretField.state.meta.errors.length > 0 && (
                            <p className="text-error text-sm mt-1" role="alert">
                              {secretField.state.meta.errors[0]}
                            </p>
                          )}
                        </div>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </div>
          )}
        </form.Field>

        <div className="card-actions justify-end p-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => {
              // Hold the loading state through the post-create navigation, so
              // the button never reverts to a bare disabled state.
              const busy = isSubmitting || submitted
              return (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!canSubmit || busy}
                >
                  {busy ? (
                    <>
                      <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                      />
                      Creating...
                    </>
                  ) : (
                    "Create Classroom"
                  )}
                </button>
              )
            }}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}

export default CreateClassroomForm
