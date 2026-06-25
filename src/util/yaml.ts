import { parseDocument } from "yaml"
import { z } from "zod"

const IdentitySchema = z.object({
  username: z.string().min(1),
  // Immutable numeric GitHub user id; nullable when unresolved.
  id: z.number().nullable().optional(),
})

const Classroom50YamlSchema = z.object({
  // All fields except classroom/assignment are optional for back-compat with
  // pre-v1 files (CLI-authored files may omit schema/owner/source).
  schema: z.string().optional(),
  classroom: z.string().min(1),
  assignment: z.string().min(1),
  owner: IdentitySchema.optional(),
  accepted_by: IdentitySchema.optional(),
  accepted_at: z.string().optional(),
  source: z
    .object({
      owner: z.string().min(1),
      repo: z.string().optional(),
      branch: z.string().optional(),
    })
    .optional(),
})

export type Classroom50Yaml = z.infer<typeof Classroom50YamlSchema>

export function parseClassroom50Yaml(source: string): Classroom50Yaml {
  const doc = parseDocument(source, {
    schema: "core",
    prettyErrors: true,
  })

  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join("\n"))
  }

  const raw = doc.toJS()

  return Classroom50YamlSchema.parse(raw)
}
