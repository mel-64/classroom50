import { useMemo, useRef, useState } from "react"

import useGetClasses from "@/hooks/useGetClasses"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import { useReuseAssignment } from "@/hooks/useReuseAssignment"
import {
  ReuseModalShell,
  reuseSlugStatus,
} from "@/components/modals/ReuseModalShell"

// Reuse an assignment FROM another classroom INTO the current one — the "pull"
// counterpart to the per-row "push" reuse on the assignments table. Opened from
// the assignments page's "New assignment" split button. v1 is in-org only:
// source classrooms are siblings under classroom50/, never a different org.
export const ReuseFromClassroomModal = ({
  org,
  classroom,
  onClose,
}: {
  org: string
  // The destination — the classroom the teacher is currently in.
  classroom: string
  onClose: () => void
}) => {
  const { classes } = useGetClasses(org)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  // Sibling classrooms only — can't pull from the one you're already in.
  const sources = useMemo(
    () => classes.filter((c) => c.name !== classroom),
    [classes, classroom],
  )

  const [sourceClassroom, setSourceClassroom] = useState("")
  const [sourceSlug, setSourceSlug] = useState("")

  // Load the chosen source classroom's assignments (lazy: only once picked).
  const {
    data: sourceData,
    isLoading: sourceLoading,
    isError: sourceError,
  } = useGetClassroomAssignments(org, sourceClassroom || undefined, {
    enabled: Boolean(sourceClassroom),
  })
  const sourceAssignments = useMemo(
    () => sourceData?.assignments ?? [],
    [sourceData],
  )

  // Preload the destination's assignments to auto-suffix/validate the slug.
  const {
    data: destData,
    isLoading: destLoading,
    isError: destError,
  } = useGetClassroomAssignments(org, classroom)
  const takenSlugs = useMemo(
    () => (destData?.assignments ?? []).map((a) => a.slug),
    [destData],
  )

  const selectedAssignment = useMemo(
    () => sourceAssignments.find((a) => a.slug === sourceSlug) ?? null,
    [sourceAssignments, sourceSlug],
  )

  const reuse = useReuseAssignment({
    org,
    targetClassroom: classroom,
    source: selectedAssignment,
    takenSlugs,
    takenLoading: destLoading,
    closeDialog: () => dialogRef.current?.close(),
  })

  const handlePickClassroom = (value: string) => {
    setSourceClassroom(value)
    setSourceSlug("")
    reuse.resetSlug()
  }

  const handlePickAssignment = (value: string) => {
    setSourceSlug(value)
    reuse.resetSlug()
  }

  return (
    <ReuseModalShell
      dialogRef={dialogRef}
      title="Reuse an existing assignment"
      description={
        <>
          Copy an assignment from another classroom in {org} into{" "}
          <span className="font-semibold text-base-content">{classroom}</span>.
          Name, template, tests, runtime, due date, and other settings are
          copied; student repositories and scores are not.
        </>
      }
      isPending={reuse.isPending}
      warning={reuse.warning}
      errorMessage={reuse.errorMessage}
      canSubmit={reuse.canSubmit}
      showSubmit={sources.length > 0}
      onSubmit={reuse.submit}
      onClose={onClose}
    >
      {sources.length === 0 ? (
        <div className="mt-6 rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
          There are no other classrooms in {org} to reuse an assignment from.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <label className="form-control w-full">
            <span className="label-text mb-1 font-medium">
              Source classroom
            </span>
            <select
              className="select select-bordered w-full"
              value={sourceClassroom}
              disabled={reuse.isPending}
              onChange={(e) => handlePickClassroom(e.target.value)}
            >
              <option value="" disabled>
                Choose a classroom…
              </option>
              {sources.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {sourceClassroom ? (
            <label className="form-control w-full">
              <span className="label-text mb-1 font-medium">Assignment</span>
              <select
                className="select select-bordered w-full"
                value={sourceSlug}
                disabled={
                  reuse.isPending ||
                  sourceLoading ||
                  sourceAssignments.length === 0
                }
                onChange={(e) => handlePickAssignment(e.target.value)}
              >
                <option value="" disabled>
                  {sourceLoading
                    ? "Loading assignments…"
                    : sourceAssignments.length === 0
                      ? "No assignments in this classroom"
                      : "Choose an assignment…"}
                </option>
                {sourceAssignments.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name || a.slug}
                  </option>
                ))}
              </select>
              {sourceError ? (
                <span className="label-text-alt mt-1 text-error">
                  Couldn’t load assignments for {sourceClassroom}.
                </span>
              ) : null}
            </label>
          ) : null}

          {selectedAssignment ? (
            <label className="form-control w-full">
              <span className="label-text mb-1 font-medium">
                Slug in {classroom}
              </span>
              <input
                type="text"
                className={`input input-bordered w-full font-mono ${
                  reuse.slugTaken ? "input-error" : ""
                }`}
                value={reuse.displayedSlug}
                disabled={reuse.isPending || destLoading}
                onChange={(e) => reuse.onSlugChange(e.target.value)}
                onBlur={reuse.onSlugBlur}
              />
              <span
                className={`label-text-alt mt-1 ${
                  reuse.slugTaken ? "text-error" : "text-base-content/50"
                }`}
              >
                {reuseSlugStatus({
                  loading: destLoading,
                  error: destError,
                  slugTaken: reuse.slugTaken,
                  slugTouched: reuse.slugTouched,
                  normalizedSlug: reuse.normalizedSlug,
                  displayedSlug: reuse.displayedSlug,
                  classroomLabel: classroom,
                  uniqueHint: "Must be unique within this classroom.",
                })}
              </span>
            </label>
          ) : null}
        </div>
      )}
    </ReuseModalShell>
  )
}

export default ReuseFromClassroomModal
