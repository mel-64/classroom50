export type GitHubOrgMembership = {
  state: "active" | "pending"
  role: "admin" | "member"
  organization: {
    login: string
    id: number
    avatar_url: string
    html_url: string
  }
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
  tree: {
    sha: string
  }
}

export type GitHubCreateCommit = {
  commit: {
    sha: string
  }
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
  default_branch: string
  visibility?: "public" | "private" | "internal"
  permissions?: {
    admin: boolean
    maintain?: boolean
    push: boolean
    triage?: boolean
    pull: boolean
  }
}

export type GitHubUser = {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name: string | null
}
