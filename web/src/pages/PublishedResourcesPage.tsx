import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  ShieldAlert,
} from "lucide-react"
import { motion } from "motion/react"
import { enterExit, staggerTransition } from "@/lib/motion"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import RequireTeacher from "@/components/RequireTeacher"
import useGetClasses from "@/hooks/useGetClasses"
import useGetClassroom from "@/hooks/useGetClassroom"
import usePagesAssignments from "@/hooks/usePagesAssignments"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { classroomPagesSegment } from "@/util/secret"

// The Pages base for an org's classroom50 config repo. The `classroom50`
// path segment is the fixed repo name, not the org name. Single-sourced
// here so every row below derives from the same builder.
function pagesBaseUrl(org: string) {
  return `https://${org}.github.io/classroom50`
}

// "engine" = generic, org-agnostic bootstrap code (identical for every org);
// "data" = org-specific content (classrooms, assignments, autograders).
type ResourceKind = "engine" | "data"

type Resource = {
  url: string
  // What the file is, in teacher-facing terms.
  label: string
  // Why it's published / who reads it.
  description: string
  kind: ResourceKind
  // Some artifacts are only present once a teacher configures them (e.g. a
  // classroom default autograder), so a 404 is expected, not a problem.
  optional?: boolean
}

const KIND_BADGE: Record<ResourceKind, { label: string; className: string }> = {
  engine: {
    label: "Engine",
    className: "badge-ghost",
  },
  data: {
    label: "Classroom data",
    className: "badge-primary badge-soft",
  },
}

// Live reachability probe for a published URL. Anonymous GET (exactly how
// students and the autograder fetch it) so the teacher sees what the public
// sees. Bounded so a hung github.io host can't stall the page.
function useResourceStatus(url: string, enabled: boolean) {
  return useQuery({
    queryKey: ["published-resource", url],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<"public" | "missing" | "unreachable"> => {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        })
        if (res.status === 404) return "missing"
        if (!res.ok) return "unreachable"
        return "public"
      } catch {
        return "unreachable"
      }
    },
  })
}

// Reports whether `ref` has entered the viewport at least once. Used to defer
// the per-resource reachability probe until the row is actually visible, so a
// teacher with many classrooms/assignments doesn't fire dozens of simultaneous
// anonymous github.io requests on mount (which edge rate-limits would surface
// as false "Unreachable" badges). Once seen, it stays true so the status
// doesn't flip back to "Checking" on scroll-out.
function useInView<T extends Element>(ref: RefObject<T | null>): boolean {
  // Fail open when IntersectionObserver is unavailable (jsdom/older browsers):
  // start visible so the probe still runs rather than hanging on "Checking".
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  )
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, inView])
  return inView
}

function CopyButton({ value }: { value: string }) {
  const { copied, copy } = useCopyToClipboard(value, 1200)
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      aria-label="Copy URL"
      title="Copy URL"
      onClick={copy}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  )
}

function StatusBadge({ url }: { url: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const { data: status, isLoading } = useResourceStatus(url, inView)

  // Before the row scrolls into view the probe is disabled (so status is
  // undefined and isLoading is false); show the pending state rather than a
  // premature "Unreachable".
  if (!inView || isLoading) {
    return (
      <span
        ref={ref}
        className="inline-flex items-center gap-1 text-xs text-base-content/70"
      >
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Checking
      </span>
    )
  }

  if (status === "public") {
    return (
      <span ref={ref} className="badge badge-success badge-soft badge-sm gap-1">
        <Globe aria-hidden="true" className="size-3" />
        Public
      </span>
    )
  }

  if (status === "missing") {
    return (
      <span
        ref={ref}
        className="badge badge-ghost badge-sm"
        title="Not published yet"
      >
        Not published
      </span>
    )
  }

  return (
    <span
      ref={ref}
      className="badge badge-warning badge-soft badge-sm"
      title="Could not reach the URL"
    >
      Unreachable
    </span>
  )
}

function ResourceRow({ resource }: { resource: Resource }) {
  const badge = KIND_BADGE[resource.kind]
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-base-200 bg-base-100 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-base-content">
            {resource.label}
          </span>
          <span className={`badge badge-sm ${badge.className}`}>
            {badge.label}
          </span>
          {resource.optional && (
            <span className="badge badge-ghost badge-sm">Optional</span>
          )}
        </div>
        <p className="mt-1 text-sm text-base-content/70">
          {resource.description}
        </p>
        <code className="mt-2 block truncate text-xs text-base-content/70">
          {resource.url}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:flex-col sm:items-end">
        <StatusBadge url={resource.url} />
        <div className="flex items-center gap-1">
          <CopyButton value={resource.url} />
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-xs"
            aria-label="Open URL"
            title="Open URL"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

// Per-classroom artifacts. Reads the published assignments.json to enumerate
// the exact per-assignment bundles/shims so the list reflects reality, not a
// guess. A classroom that hasn't published yet still shows its index/manifest
// rows (which will read "Not published").
function ClassroomResources({
  org,
  classroom,
  index = 0,
}: {
  org: string
  classroom: string
  index?: number
}) {
  const base = pagesBaseUrl(org)
  const { data: classroomData } = useGetClassroom(org, classroom)
  const secret = classroomData?.secret
  const { data: assignments } = usePagesAssignments(org, classroom, secret)
  const [open, setOpen] = useState(true)

  // When the classroom is protected, everything for it is served under the
  // capability-URL segment; otherwise the plain classroom path. Same segment
  // builder the Pages URL helpers use, so the two can't drift.
  const classroomBase = `${base}/${classroomPagesSegment(classroom, secret)}`

  const resources = useMemo<Resource[]>(() => {
    const rows: Resource[] = [
      {
        url: `${classroomBase}/assignments.json`,
        label: "Assignments manifest",
        description:
          "Every assignment's slug, mode, template, autograder, runtime, declarative tests, and allowed-files list for this classroom. Read by students (accept/submit) and the autograde runner.",
        kind: "data",
      },
      {
        url: `${classroomBase}/autograder.py`,
        label: "Classroom default autograder",
        description:
          "The fallback grading script used when an assignment has no per-assignment autograder. Only present if you ran autograder set-default.",
        kind: "data",
        optional: true,
      },
    ]

    for (const a of assignments ?? []) {
      rows.push({
        url: `${classroomBase}/autograders/${a.slug}.tar.gz`,
        label: `Autograder bundle — ${a.name || a.slug}`,
        description:
          "Per-assignment grading bundle (autograder.py + fixtures + materialized tests) downloaded by the autograde runner at grade time.",
        kind: "data",
      })
      // Only assignments using a non-default named autograder publish a
      // workflow shim; the default autograder uses the embedded shim instead.
      if (a.autograder && a.autograder !== "default") {
        rows.push({
          url: `${classroomBase}/autograders/${a.autograder}.yaml`,
          label: `Autograder workflow shim — ${a.autograder}`,
          description:
            "Non-default autograder workflow shim fetched when a student accepts an assignment that overrides the default runner.",
          kind: "data",
          optional: true,
        })
      }
    }

    return rows
  }, [assignments, classroomBase])

  return (
    <motion.div
      className="rounded-2xl border border-base-200 bg-base-100"
      variants={enterExit}
      initial="initial"
      animate="animate"
      transition={staggerTransition(index)}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{classroom}</h3>
            {secret ? (
              <span className="badge badge-warning badge-soft badge-sm gap-1">
                <ShieldAlert aria-hidden="true" className="size-3" />
                Unlisted
              </span>
            ) : (
              <span className="badge badge-ghost badge-sm">Public path</span>
            )}
          </div>
          <p className="text-xs text-base-content/70">
            {resources.length} published resource
            {resources.length === 1 ? "" : "s"}
            {secret ? " · served at an unlisted URL" : ""}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`size-5 shrink-0 text-base-content/70 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-base-200 p-5">
          {secret && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-base-content/70">
              <ShieldAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              <span>
                This classroom uses an unlisted URL: its resources are served at
                an unguessable path instead of a guessable one. This is
                obscurity, not access control — the link is the only thing
                guarding the data, anyone who has it can read the file, and
                links can leak (browser history, referrers, search crawlers).
                Share the per-assignment accept link or CLI command (which
                include the key) from each assignment&apos;s page.
              </span>
            </div>
          )}
          {resources.map((r) => (
            <ResourceRow key={r.url} resource={r} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

export const PublishedResourcesPane = ({ org }: { org: string }) => {
  const base = pagesBaseUrl(org)
  const { classes } = useGetClasses(org)

  // Org-level resources are independent of any classroom: the public index
  // and the two generic engine scripts served at the Pages site root.
  const orgResources: Resource[] = [
    {
      url: `${base}/classrooms-index.json`,
      label: "Classrooms index",
      description:
        "Public list of this org's classrooms with allow-listed fields only (name, term, short name). Internal data such as the GitHub team is deliberately stripped. Lets students confirm this is a real Classroom 50 org.",
      kind: "data",
    },
    {
      url: `${base}/runner.py`,
      label: "Autograde runner engine",
      description:
        "The generic grading bootstrap fetched by every student repo's autograde workflow. Org-agnostic — identical for every organization, contains no classroom data.",
      kind: "engine",
    },
    {
      url: `${base}/ensure_feedback_pr.py`,
      label: "Feedback PR helper",
      description:
        "Generic helper that opens/refreshes the per-submission Feedback PR. Org-agnostic — contains no classroom data.",
      kind: "engine",
    },
  ]

  return (
    <div className="mt-8 flex flex-col gap-8">
      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
        <div>
          <p className="font-semibold text-base-content">
            Everything below is served publicly over the internet
          </p>
          <p className="mt-1 text-base-content/70">
            Your <span className="font-semibold">classroom50</span> config repo
            is private, but its GitHub Pages site is public by design — students
            and the autograder fetch these files without authenticating. Only
            the allow-listed files below are published; anything else in the
            repo (your roster, internal classroom fields, service token) stays
            private. A classroom can use an unlisted URL to make its files
            harder to find, but that is obscurity, not access control — the
            files are still public to anyone who has the link.
          </p>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2">
          <Globe aria-hidden="true" className="size-5 text-base-content/70" />
          <h2 className="text-lg font-bold">Organization-level</h2>
        </div>
        <p className="mt-1 text-sm text-base-content/70">
          Served at the root of <code className="text-xs">{base}/</code>.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {orgResources.map((r) => (
            <ResourceRow key={r.url} resource={r} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2">
          <ShieldAlert
            aria-hidden="true"
            className="size-5 text-base-content/70"
          />
          <h2 className="text-lg font-bold">Per-classroom</h2>
        </div>
        <p className="mt-1 text-sm text-base-content/70">
          Assignment manifests and autograders for each classroom.
        </p>
        {classes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-base-300 bg-base-100 p-6 text-center text-sm text-base-content/70">
            No classrooms yet. Once you create one and it publishes, its
            resources will appear here.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {classes.map((cl, i) => (
              <ClassroomResources
                key={cl.path}
                org={org}
                classroom={cl.path}
                index={i}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const PublishedResourcesPage = () => {
  useDocumentTitle("Published Resources")
  const { org } = useParams({ strict: false })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-base-200 xl:px-50">
          <RequireTeacher>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Published resources
              </h1>
              <p className="mt-1 text-sm text-base-content/70">
                Everything publicly served from{" "}
                <span className="font-mono font-semibold">{org}</span>’s GitHub
                Pages site.
              </p>
            </div>
            {org && <PublishedResourcesPane org={org} />}
          </RequireTeacher>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="published" />
      </Drawer>
    </div>
  )
}

export default PublishedResourcesPage
