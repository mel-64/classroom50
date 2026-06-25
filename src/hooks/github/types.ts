export type GitHubOrgMembership = {
  state: "active" | "pending"
  role: "admin" | "member"
  organization: {
    login: string
    id: number
    avatar_url: string
    html_url: string
    description: string
  }
}

// Shared by GET /orgs/{org}/invitations and /failed_invitations. failed_at /
// failed_reason are only set on the failed list. No invitee numeric id, so
// students match on login / email. id is needed to cancel (DELETE) before resend.
export type GitHubOrgInvitation = {
  id: number
  login: string | null
  email: string | null
  role: string
  created_at: string
  failed_at: string | null
  failed_reason: string | null
}

export type GitHubBranchRef = {
  ref: string
  node_id: string
  url: string
  object: {
    type: string
    sha: string
    url: string
  }
}

export type GitHubCommitRef = {
  sha: string
  tree: {
    sha: string
  }
}

export type GitHubCreateTree = {
  sha: string
}

export type GitHubCreateCommit = {
  sha: string
}

export type GitHubMoveBranch = {
  ref: string
  object: {
    sha: string
  }
}

export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  is_template?: boolean
  default_branch: string
  visibility?: "public" | "private" | "internal"
  permissions?: {
    admin: boolean
    maintain?: boolean
    push: boolean
    triage?: boolean
    pull: boolean
  }
  ssh_url: string
  html_url: string
}

export type GitHubUser = {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name: string | null
  email: string | null
  bio: string | null
  permissions: {
    admin: boolean
    pull: boolean
    maintain: boolean
    push: boolean
  }
}

export type GitHubFileListing = {
  type: string
  name: string
  path: string
}

export type GitHubTeam = {
  id: number
  name: string
  slug: string
  privacy: "secret" | "closed"
  description: string | null
}

export type GitHubOrgDetails = {
  login: string
  id: number
  plan: {
    name: string
    space: number
    filled_seats: number
    seats: number
  }
}

export type GitHubWorkflowRun = {
  id: number
  status:
    | "queued"
    | "in_progress"
    | "completed"
    | "waiting"
    | "requested"
    | "pending"
  conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | "neutral"
    | "stale"
    | null
  created_at: string
  html_url: string
  event: string
}
