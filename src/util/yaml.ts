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
  // Mirrors the CLI's repo-config-v1 schema. Pattern-checked at the read
  // boundary so a hand-edited/desynced value can't reach a Pages URL segment;
  // an invalid value degrades to "no secret" rather than failing the parse.
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

// Self-report payload for email-first onboarding. username/id are GitHub-
// attested (from the authenticated session); email is claimed.
const OnboardingYamlSchema = z.object({
  email: z.string().min(1),
  // Student-supplied display name. Optional for back-compat with pre-name
  // payloads; default to "" so reconcile fills it when present, leaves when not.
  first_name: z.string().optional().default(""),
  last_name: z.string().optional().default(""),
  github_username: z.string().min(1),
  github_id: z.number(),
  classroom: z.string().min(1),
  created_at: z.string().optional(),
  // Teacher-issued secure-link token, present only for secure-link onboarding.
  // Reconcile's strongest match key; validated loosely here (any string) and
  // pattern-checked by the consumer before use.
  invite_token: z.string().optional(),
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
