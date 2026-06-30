import { Search, X } from "lucide-react"

import type {
  SubmissionFilters,
  SubmissionSort,
} from "@/pages/submissions/dashboard"
import { DEFAULT_FILTERS } from "@/pages/submissions/dashboard"

// Search + sort + filter controls for the assignment overview dashboard
// (issue #59). Controlled by SubmissionsPage; emits filter/sort/query changes.
// The not-submitted filter is hidden for group assignments (no roster
// denominator); passing/accepted selects appear only when available.
const SubmissionsControls = ({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  isGroup = false,
  acceptedAvailable = false,
  passingAvailable = false,
  sections = [],
}: {
  query: string
  onQueryChange: (value: string) => void
  filters: SubmissionFilters
  onFiltersChange: (filters: SubmissionFilters) => void
  sort: SubmissionSort
  onSortChange: (sort: SubmissionSort) => void
  isGroup?: boolean
  acceptedAvailable?: boolean
  passingAvailable?: boolean
  sections?: string[]
}) => {
  const hasActiveFilter =
    filters.submission !== "all" ||
    filters.passing !== "all" ||
    filters.accepted !== "all" ||
    filters.section !== "all" ||
    query.trim() !== ""

  const clearAll = () => {
    onQueryChange("")
    onFiltersChange({ ...DEFAULT_FILTERS })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="input input-bordered input-sm flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-xs">
        <Search className="size-4 opacity-60" />
        <input
          type="search"
          className="grow"
          placeholder={isGroup ? "Search group or member…" : "Search student…"}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search submissions"
        />
      </label>

      {sections.length > 0 && (
        <select
          className="select select-bordered select-sm w-auto min-w-0 max-w-[10rem]"
          value={filters.section}
          onChange={(e) =>
            onFiltersChange({ ...filters, section: e.target.value })
          }
          aria-label="Filter by section"
        >
          <option value="all">All sections</option>
          {sections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>
      )}

      <select
        className="select select-bordered select-sm w-auto min-w-0"
        value={filters.submission}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            submission: e.target.value as SubmissionFilters["submission"],
          })
        }
        aria-label="Filter by submission status"
      >
        <option value="all">All submissions</option>
        <option value="submitted">Submitted</option>
        <option value="on-time">On time</option>
        <option value="late">Late</option>
        {!isGroup && (
          // A grade requires a submission, so "Not submitted" is mutually
          // exclusive with a passing/failing filter — disable it then.
          <option value="not-submitted" disabled={filters.passing !== "all"}>
            Not submitted
          </option>
        )}
      </select>

      {passingAvailable && (
        <select
          className="select select-bordered select-sm w-auto min-w-0"
          value={filters.passing}
          // Disabled when filtering to non-submitters: they have no grade, so a
          // passing/failing filter would always yield an empty table.
          disabled={filters.submission === "not-submitted"}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              passing: e.target.value as SubmissionFilters["passing"],
            })
          }
          aria-label="Filter by passing status"
        >
          <option value="all">All grades</option>
          <option value="passing">Passing</option>
          <option value="failing">Failing</option>
        </select>
      )}

      {acceptedAvailable && (
        <select
          className="select select-bordered select-sm w-auto min-w-0"
          value={filters.accepted}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              accepted: e.target.value as SubmissionFilters["accepted"],
            })
          }
          aria-label="Filter by acceptance status"
        >
          <option value="all">All acceptance</option>
          <option value="accepted">Accepted</option>
          <option value="not-accepted">Not accepted</option>
        </select>
      )}

      {hasActiveFilter && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={clearAll}
        >
          <X className="size-4" /> Clear
        </button>
      )}

      <select
        className="select select-bordered select-sm ml-auto w-auto min-w-0"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SubmissionSort)}
        aria-label="Sort submissions"
      >
        <option value="recent">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name-asc">Name A–Z</option>
        <option value="name-desc">Name Z–A</option>
      </select>
    </div>
  )
}

export default SubmissionsControls
