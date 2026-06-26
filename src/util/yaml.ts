import { parseDocument, stringify as stringifyDocument } from "yaml"
import { z } from "zod"
import { SECRET_PATTERN } from "./secret"

const IdentitySchema = z.object({
  username: z.string().min(1),
  // Immutable numeric GitHub user id; nullable when unresolved.
  id: z.number().nullable().optional(),
  // UTC instant of the accept commit (the owner is the acceptor).
  accepted_at: z.string().optional(),
})

const Classroom50YamlSchema = z.object({
  // All fields except classroom/assignment are optional for back-compat with
  // pre-v1 files (CLI-authored files may omit schema/owner/source).
  schema: z.string().optional(),
  classroom: z.string().min(1),
  assignment: z.string().min(1),
  // Optional capability-URL secret, present only for a protected classroom.
  // Mirrors the CLI's repo-config-v1 schema; consumers use the
  // <classroom>/<secret>/ Pages path when it's present. Pattern-checked at the
  // read boundary so a hand-edited or CLI-desynced value can't flow into a
  // Pages URL path segment unvalidated; an invalid value degrades to "no
  // secret" (plain path) rather than failing the whole document parse.
  secret: z.string().regex(SECRET_PATTERN).optional().catch(undefined),
  owner: IdentitySchema.optional(),
  source: z
    .object({
      owner: z.string().min(1),
      // Template owner's immutable id (org or user); nullable when unresolved.
      owner_id: z.number().nullable().optional(),
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

// Self-report payload for the email-first onboarding flow, committed to the
// onboarding repo and read back by the teacher reconcile step. username/id are
// GitHub-attested (from the authenticated session); email is claimed.
const OnboardingYamlSchema = z.object({
  email: z.string().min(1),
  // Student-supplied display name. Optional for back-compat with payloads
  // written before name collection; default to "" so reconcile can fill the
  // roster when present and leave it untouched when absent.
  first_name: z.string().optional().default(""),
  last_name: z.string().optional().default(""),
  github_username: z.string().min(1),
  github_id: z.number(),
  classroom: z.string().min(1),
  created_at: z.string().optional(),
})

export type OnboardingYaml = z.infer<typeof OnboardingYamlSchema>

export function parseOnboardingYaml(source: string): OnboardingYaml {
  const doc = parseDocument(source, { schema: "core", prettyErrors: true })

  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join("\n"))
  }

  return OnboardingYamlSchema.parse(doc.toJS())
}

export function stringifyOnboardingYaml(payload: OnboardingYaml): string {
  return stringifyDocument(payload)
}
