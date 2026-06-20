import { useState } from "react"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useParams } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { putRepoSecret } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"

export const OrgSettingsPane = ({ onSubmit }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { org } = useParams({ strict: false })
  const [collectToken, setCollectToken] = useState("")
  const [patSaved, setPatSaved] = useState(false)

  const collectTokenUrl =
    "https://github.com/settings/personal-access-tokens/new?" +
    new URLSearchParams({
      name: `Classroom 50 Actions Token`,
      description: `Read-only token for Classroom 50 GitHub Actions for ${org} organization`,
      target_name: org ?? "",
      expires_in: "90",
      contents: "read",
    }).toString()

  const patMutation = useMutation({
    mutationFn: () => {
      return putRepoSecret(
        client,
        org,
        "classroom50",
        "CLASSROOM50_COLLECT_TOKEN",
        collectToken,
      )
    },
    onSuccess: () => {
      setCollectToken("")
      setPatSaved(true)
      onSubmit?.()
      queryClient.invalidateQueries({ queryKey: ["orgs"] })
    },
  })

  return (
    <div>
      <div className="mt-8">
        <h2 className="text-xl font-bold">Personal Access Token (PAT)</h2>
        <p className="mt-2 text-sm text-base-content/60">
          Classroom 50 requires a Personal Access Token (PAT) with the ability
          to read repositories in your classroom’s GitHub organization. Visit{" "}
          <a
            className="link link-info"
            href={collectTokenUrl}
            target="_blank"
            rel="noreferrer"
          >
            this URL
          </a>{" "}
          and click "Generate Token" to create an access token. Then, paste your
          newly created token here.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!patMutation.isPending) patMutation.mutate()
          }}
        >
          <div className="flex flex-col gap-2 w-full pb-10">
            <label className="label font-bold mt-4 text-sm">Enter PAT</label>
            <input
              type="password"
              placeholder="Enter token (e.g., github_pat_123...)"
              className="input input-bordered w-full"
              autoComplete="off"
              value={collectToken}
              onChange={(e) => setCollectToken(e.target.value)}
            />
            <button
              disabled={patMutation.isPending}
              type="submit"
              className="btn btn-primary w-40 self-end mt-2"
            >
              {patMutation.isPending ? (
                <span className="loading loading-spinner" />
              ) : (
                "Save PAT"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const OrgSettingsPage = () => {
  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] xl:px-50">
          <OrgSettingsPane />
        </DrawerContent>
        <DrawerSidebar page="classes" settings selected="settings" />
      </Drawer>
    </div>
  )
}

export default OrgSettingsPage
