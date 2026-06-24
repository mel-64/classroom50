import {
  githubOAuthAppConnectionUrl,
  githubOrgOAuthPolicyUrl,
} from "@/auth/constants"

export type TemplateAccessLink = { label: string; href: string }

// Structured error for a failed template generate at accept time. Carries a
// short message plus action links so the UI can render clickable buttons.
export class TemplateAccessError extends Error {
  links: TemplateAccessLink[]

  constructor(args: { message: string; links?: TemplateAccessLink[] }) {
    super(args.message)
    this.name = "TemplateAccessError"
    this.links = args.links ?? []
  }
}

// Out-of-org template generate failed. Usually the template org restricts
// third-party apps and hasn't approved Classroom 50; only its owner can fix it.
export function outOfOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  const appUrl = githubOAuthAppConnectionUrl()
  return new TemplateAccessError({
    message: `${templateOwner} restricts third-party apps, so Classroom 50 can't copy ${templateOwner}/${templateRepo} (HTTP ${status}). An owner of ${templateOwner} must approve the Classroom 50 app.`,
    links: [
      {
        label: `Approve in ${templateOwner} settings`,
        href: githubOrgOAuthPolicyUrl(templateOwner),
      },
      ...(appUrl ? [{ label: "Review your app access", href: appUrl }] : []),
    ],
  })
}

// In-org template generate failed. Usually a private template the classroom
// team can't read yet; re-running assignment setup grants it.
export function inOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  return new TemplateAccessError({
    message: `Couldn't copy the private template ${templateOwner}/${templateRepo} (HTTP ${status}). Ask your instructor to re-run assignment setup, then accept again.`,
  })
}
