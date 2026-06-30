import { ExternalLink } from "lucide-react"
import GitHub from "@/assets/github.svg?react"

// Shared "open on GitHub" deep-link, so the section headers that use it can't
// drift in markup. `className` tunes layout per call site (e.g. `shrink-0`).
export const GitHubLink = ({
  href,
  label,
  title,
  className = "",
}: {
  href: string
  label: string
  title?: string
  className?: string
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    title={title}
    className={`inline-flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary ${className}`}
  >
    <GitHub className="size-4" />
    {label}
    <ExternalLink className="size-3" />
  </a>
)

export default GitHubLink
