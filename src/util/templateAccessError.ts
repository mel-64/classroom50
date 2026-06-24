// A template-generate failure at accept time, carrying a student-facing,
// plain-text message. Students can't change a template org's settings or the
// classroom team's access themselves, so every message points them at their
// instructor. The accept page renders the message as-is (no buttons/links): a
// student isn't the actor who can approve an OAuth app or grant team read.
export class TemplateAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateAccessError"
  }
}

// Out-of-org template: the owning org likely restricts third-party apps.
export function outOfOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  return new TemplateAccessError(
    `Couldn't copy the template ${templateOwner}/${templateRepo} (HTTP ${status}). The ${templateOwner} organization restricts third-party apps. Ask your instructor to approve the Classroom 50 app for ${templateOwner} (or make the template public), then accept again.`,
  )
}

// In-org template: the classroom team likely lacks read on a private template.
export function inOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  return new TemplateAccessError(
    `Couldn't copy the private template ${templateOwner}/${templateRepo} (HTTP ${status}). Ask your instructor to re-run assignment setup, then accept again.`,
  )
}
