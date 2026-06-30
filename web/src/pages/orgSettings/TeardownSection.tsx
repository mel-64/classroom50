import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"

import { ConfirmModal } from "@/components/modals"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import {
  executeTeardown,
  formatTeardownResult,
  planTeardown,
  TeardownMarkerError,
  TeardownRateLimitError,
  TeardownScopeError,
  type TeardownPlan,
} from "@/api/mutations/teardown"
import SettingsSection from "./SettingsSection"

// Teardown / org reset: deletes ALL repos in the org (mirroring the CLI's
// `gh teacher teardown`), marker-gated and behind a typed-org-name
// confirmation. Owner-gated; destructive and irreversible.
const TeardownSection = ({ org }: { org: string }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const runTeardown = useSafeSubmit()

  const { data: membership } = useGetOrgMembership(org)
  const isOwner = membership?.role === "admin"

  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<TeardownPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const openMutation = useMutation({
    mutationFn: () => planTeardown(client, org),
    onSuccess: (p) => {
      setPlan(p)
      setError(null)
      setOpen(true)
    },
    onError: (err) => {
      setError(
        err instanceof TeardownMarkerError
          ? err.message
          : "Couldn't prepare the teardown plan.",
      )
    },
  })

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!plan) return
      const result = await executeTeardown(client, plan)
      return result
    },
    onSuccess: (result) => {
      setOpen(false)
      if (!result) {
        setDone(null)
      } else {
        setDone(
          formatTeardownResult(result, `https://github.com/orgs/${org}/teams`),
        )
      }
      void queryClient.invalidateQueries({ queryKey: ["orgs"] })
    },
    onError: (err) => {
      if (err instanceof TeardownScopeError) {
        setError(err.message)
      } else if (err instanceof TeardownRateLimitError) {
        setError(err.message)
        // Some repos may already be gone; refresh the org view.
        void queryClient.invalidateQueries({ queryKey: ["orgs"] })
      } else {
        setError(
          "Teardown failed. Some repositories may not have been deleted.",
        )
      }
    },
  })

  return (
    <SettingsSection
      tone="danger"
      title="Danger zone"
      titleAdornment={<TriangleAlert className="size-5 text-error" />}
      description={
        <>
          Tear down this organization by deleting <strong>every</strong>{" "}
          repository in it, including the <code>classroom50</code> config repo,
          and removing the GitHub team of every classroom. This is irreversible.
        </>
      }
    >
      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      )}
      {done && <p className="text-sm text-success">{done}</p>}

      <button
        type="button"
        className={`btn btn-error btn-sm ${error || done ? "mt-4" : ""}`}
        disabled={!isOwner || openMutation.isPending}
        title={isOwner ? undefined : "Requires organization owner permissions"}
        onClick={() => {
          if (!openMutation.isPending) openMutation.mutate()
        }}
      >
        {openMutation.isPending ? "Preparing…" : "Tear down organization"}
      </button>

      {!isOwner && (
        <p className="mt-2 text-xs text-base-content/50">
          Teardown requires organization owner permissions.
        </p>
      )}

      <ConfirmModal
        open={open}
        dangerous
        needsConfirm
        confirmText={org}
        confirmLabel="Delete all resources"
        title="Delete every repository in this org?"
        description={
          <div className="space-y-2 text-sm">
            <p>
              This will permanently delete{" "}
              <strong>{plan?.repoNames.length ?? 0}</strong> repositories in{" "}
              <span className="font-mono">{org}</span>, including the{" "}
              <code>classroom50</code> config repo (deleted last)
              {plan && plan.teams.length > 0 ? (
                <>
                  , and remove <strong>{plan.teams.length}</strong> classroom
                  team
                  {plan.teams.length === 1 ? "" : "s"}
                </>
              ) : null}
              . This cannot be undone.
            </p>
            {plan && plan.repoNames.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-base-content/70">
                  Repositories
                </p>
                <ul className="max-h-40 overflow-auto rounded border border-base-300 bg-base-100 p-2 font-mono text-xs">
                  {plan.repoNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            {plan && plan.teams.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-base-content/70">
                  Classroom teams
                </p>
                <ul className="max-h-40 overflow-auto rounded border border-base-300 bg-base-100 p-2 font-mono text-xs">
                  {plan.teams.map((team) => (
                    <li key={team.slug}>{team.slug}</li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              Type <span className="font-mono font-semibold">{org}</span> to
              confirm.
            </p>
          </div>
        }
        onConfirm={async () => {
          await runTeardown(() => runMutation.mutateAsync())
        }}
        onClose={() => setOpen(false)}
      />
    </SettingsSection>
  )
}

export default TeardownSection
