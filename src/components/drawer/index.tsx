import {
  GraduationCap,
  BookText,
  UsersRound,
  LogOut,
  MessageCircleQuestionMark,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Menu,
  FileCheck2,
} from "lucide-react"
import { Link, useParams, useMatchRoute } from "@tanstack/react-router"
import { useGithubAuth } from "../../auth/useGithubAuth"
import duck from "@/assets/duck.png"
import { useCourseTeacherAccess } from "../../hooks/useCourseTeacherAccess"
import useGetClassroom from "@/hooks/useGetClassroom"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import type { Classroom } from "@/types/classroom"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

const SIDEBAR_COLLAPSED_KEY = "classroom50:sidebar-collapsed"
const MOBILE_DRAWER_ID = "app-drawer"

type SidebarCollapseContextValue = {
  collapsed: boolean
  toggle: () => void
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue>({
  collapsed: false,
  toggle: () => {},
})

const useSidebarCollapse = () => useContext(SidebarCollapseContext)

const Drawer = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  return (
    <SidebarCollapseContext.Provider
      value={{ collapsed, toggle: () => setCollapsed((value) => !value) }}
    >
      <div className="drawer lg:drawer-open">{children}</div>
    </SidebarCollapseContext.Provider>
  )
}

export const DrawerContent = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <div className={`${className} drawer-content`}>
    <label
      htmlFor={MOBILE_DRAWER_ID}
      aria-label="Open menu"
      className="btn btn-ghost btn-square fixed top-3 left-3 z-30 lg:hidden"
    >
      <Menu className="size-6" />
    </label>
    {children}
  </div>
)

export const DrawerToggle = () => (
  <input id={MOBILE_DRAWER_ID} type="checkbox" className="drawer-toggle" />
)

export const DrawerSidebar = ({
  selected = "",
  page = "",
  settings = false,
}) => {
  const { collapsed } = useSidebarCollapse()
  return (
    <div className="drawer-side z-40">
      <label
        htmlFor={MOBILE_DRAWER_ID}
        aria-label="Close menu"
        className="drawer-overlay"
      />
      <div
        className={`flex flex-col min-h-full bg-[#212a3a] text-white transition-[width] duration-200 ease-out ${
          collapsed
            ? "w-16 min-w-16 [&>div]:px-2"
            : "w-60 min-w-30 [&>div]:px-6"
        }`}
      >
        {page === "classes" ? (
          <SidebarContentClasses selected={selected} settings={settings} />
        ) : page === "orgs" ? (
          <SidebarContentOrgs selected={selected} />
        ) : (
          <SidebarContent selected={selected} />
        )}
      </div>
    </div>
  )
}

const navItemClass = (active: boolean, collapsed: boolean) =>
  `flex items-center gap-2 rounded-box border-l-2 px-2 py-2 transition-colors ${
    collapsed ? "justify-center" : ""
  } ${
    active
      ? "border-[#accefb] bg-[#323b49]"
      : "border-transparent hover:bg-[#323b49]/60"
  }`

const Tip = ({ label, children }: { label: string; children: ReactNode }) => {
  const { collapsed } = useSidebarCollapse()
  if (!collapsed) return <>{children}</>
  return (
    <div
      className="tooltip tooltip-right w-full [--tt-bg:#323b49] before:text-white"
      data-tip={label}
    >
      {children}
    </div>
  )
}

export const ClassroomLogo = () => {
  const { collapsed, toggle } = useSidebarCollapse()

  if (collapsed) {
    return (
      <div className="flex items-center justify-center px-2 py-6 border-b-1 border-[#444]">
        <button
          type="button"
          onClick={toggle}
          className="tooltip tooltip-right [--tt-bg:#323b49] before:text-white cursor-pointer rounded-md p-1 transition-colors hover:bg-[#323b49]"
          data-tip="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <GraduationCap className="size-8 text-[#accefb]" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-6 py-6 border-b-1 border-[#444]">
      <Link
        to="/"
        className="flex flex-1 min-w-0 items-center text-lg text-white font-bold"
        title="Classroom 50"
      >
        <GraduationCap className="size-8 text-[#accefb] shrink-0 mr-2" />
        <span className="whitespace-nowrap">Classroom 50</span>
      </Link>
      <button
        type="button"
        onClick={toggle}
        className="shrink-0 rounded-md p-1 text-[#aaa] transition-colors hover:bg-[#323b49] hover:text-white cursor-pointer"
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
      >
        <ChevronLeft className="size-5" />
      </button>
    </div>
  )
}

const ExpandSidebarButton = () => {
  const { collapsed, toggle } = useSidebarCollapse()
  if (!collapsed) return null

  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        onClick={toggle}
        className="tooltip tooltip-right [--tt-bg:#323b49] before:text-white cursor-pointer rounded-md p-2 text-[#aaa] transition-colors hover:bg-[#323b49] hover:text-white"
        data-tip="Expand sidebar"
        aria-label="Expand sidebar"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}

export const AllClasses = ({ org }: { org: string }) => {
  const { collapsed } = useSidebarCollapse()

  if (collapsed) {
    return (
      <div className="flex justify-center py-2 text-sm">
        <Link
          to="/$org/classes"
          params={{ org }}
          className="tooltip tooltip-right [--tt-bg:#323b49] before:text-white rounded-md p-1 text-[#aaa] transition-colors hover:bg-[#323b49] hover:text-white"
          data-tip="All Classes"
          aria-label="All Classes"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="py-4 text-sm">
      <Link to="/$org/classes" params={{ org }} className="text-center">
        ‹ All Classes
      </Link>
    </div>
  )
}

export const SidebarClassInfo = ({ classInfo }: { classInfo?: Classroom }) => {
  const { classroom } = useParams({ strict: false })
  const { collapsed } = useSidebarCollapse()

  if (collapsed) return null

  return (
    <div className="py-2">
      <h3 className="font-bold">
        {classInfo?.name ||
          classInfo?.short_name ||
          classroom ||
          "Untitled Course"}
      </h3>
      <p className="text-gray-500 text-sm">{classInfo?.term ?? ""}</p>
    </div>
  )
}

const AssignmentSidebarMenu = ({
  org,
  classroom,
  assignment,
}: {
  org: string
  classroom: string
  assignment: string
}) => {
  const { collapsed } = useSidebarCollapse()
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)
  const matchRoute = useMatchRoute()

  // Resolve the display name from whichever source the role can read.
  const { data: teacherAssignments } = useGetClassroomAssignments(
    org,
    classroom,
  )
  const { assignment: publicAssignment } = useGetPublicAssignment(
    org,
    classroom,
    assignment,
  )
  const assignmentName =
    teacherAssignments?.assignments.find((a) => a.slug === assignment)?.name ||
    publicAssignment?.name ||
    assignment

  const onSubmissions = Boolean(
    matchRoute({
      to: "/$org/$classroom/assignments/$assignment/submissions",
      fuzzy: false,
    }) ||
    matchRoute({
      to: "/$org/$classroom/assignments/$assignment",
      fuzzy: false,
    }),
  )
  const onSubmission = Boolean(
    matchRoute({
      to: "/$org/$classroom/assignments/$assignment/submission",
      fuzzy: false,
    }),
  )
  const onSettings = Boolean(
    matchRoute({
      to: "/$org/$classroom/assignments/$assignment/edit",
      fuzzy: false,
    }),
  )

  return (
    <>
      {/* Back to the assignments list */}
      {collapsed ? (
        <div className="flex justify-center py-2 text-sm">
          <Link
            to="/$org/$classroom/assignments"
            params={{ org, classroom }}
            className="tooltip tooltip-right [--tt-bg:#323b49] before:text-white rounded-md p-1 text-[#aaa] transition-colors hover:bg-[#323b49] hover:text-white"
            data-tip="All Assignments"
            aria-label="All Assignments"
          >
            <ArrowLeft className="size-5" />
          </Link>
        </div>
      ) : (
        <div className="py-4 text-sm">
          <Link to="/$org/$classroom/assignments" params={{ org, classroom }}>
            ‹ All Assignments
          </Link>
        </div>
      )}

      {!collapsed && (
        <div className="py-2">
          <h3 className="font-bold leading-tight">{assignmentName}</h3>
          <p className="text-gray-500 text-sm">Assignment</p>
        </div>
      )}

      <div className="py-4">
        <ul className="flex flex-col gap-1">
          {!roleResolved ? (
            <>
              {[0, 1].map((i) => (
                <li key={i} className="flex px-2 py-2">
                  <span className="skeleton h-4 w-24 bg-white/10" />
                </li>
              ))}
            </>
          ) : showTeacherUi ? (
            <>
              <Tip label="Submissions">
                <Link
                  to="/$org/$classroom/assignments/$assignment/submissions"
                  params={{ org, classroom, assignment }}
                >
                  <li
                    aria-current={onSubmissions ? "page" : undefined}
                    className={navItemClass(onSubmissions, collapsed)}
                  >
                    <UsersRound className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate">Submissions</span>
                    )}
                  </li>
                </Link>
              </Tip>
              <Tip label="Assignment Settings">
                <Link
                  to="/$org/$classroom/assignments/$assignment/edit"
                  params={{ org, classroom, assignment }}
                >
                  <li
                    aria-current={onSettings ? "page" : undefined}
                    className={navItemClass(onSettings, collapsed)}
                  >
                    <Settings className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate">Assignment Settings</span>
                    )}
                  </li>
                </Link>
              </Tip>
            </>
          ) : (
            <>
              <Tip label="My Submission">
                <Link
                  to="/$org/$classroom/assignments/$assignment/submission"
                  params={{ org, classroom, assignment }}
                >
                  <li
                    aria-current={onSubmission ? "page" : undefined}
                    className={navItemClass(onSubmission, collapsed)}
                  >
                    <FileCheck2 className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate">My Submission</span>
                    )}
                  </li>
                </Link>
              </Tip>
              <Tip label="Assignment Settings">
                <Link
                  to="/$org/$classroom/assignments/$assignment/edit"
                  params={{ org, classroom, assignment }}
                >
                  <li
                    aria-current={onSettings ? "page" : undefined}
                    className={navItemClass(onSettings, collapsed)}
                  >
                    <Settings className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate">Assignment Settings</span>
                    )}
                  </li>
                </Link>
              </Tip>
            </>
          )}
        </ul>
      </div>
    </>
  )
}

export const TeacherSidebarMenu = ({
  org,
  classroom,
  selected,
}: {
  org: string
  classroom: string
  selected: string
}) => {
  // Placeholder while pending so items never flash in then out.
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)
  const { collapsed } = useSidebarCollapse()

  return (
    <div className="py-4">
      <ul className="flex flex-col gap-1">
        <Tip label="Assignments">
          <Link to="/$org/$classroom/assignments" params={{ org, classroom }}>
            <li
              aria-current={selected === "assignments" ? "page" : undefined}
              className={navItemClass(selected === "assignments", collapsed)}
            >
              <BookText className="shrink-0" />
              {!collapsed && <span className="truncate">Assignments</span>}
            </li>
          </Link>
        </Tip>
        {!roleResolved ? (
          <>
            {[0, 1].map((i) => (
              <li key={i} className="flex px-2 py-2">
                <span className="skeleton h-4 w-24 bg-white/10" />
              </li>
            ))}
          </>
        ) : (
          showTeacherUi && (
            <>
              <Tip label="Students">
                <Link
                  to="/$org/$classroom/students"
                  params={{ org, classroom }}
                >
                  <li
                    aria-current={selected === "students" ? "page" : undefined}
                    className={navItemClass(selected === "students", collapsed)}
                  >
                    <UsersRound className="shrink-0" />
                    {!collapsed && <span className="truncate">Students</span>}
                  </li>
                </Link>
              </Tip>
              <Tip label="Settings">
                <Link to="/$org/$classroom/edit" params={{ org, classroom }}>
                  <li
                    aria-current={selected === "settings" ? "page" : undefined}
                    className={navItemClass(selected === "settings", collapsed)}
                  >
                    <Settings className="shrink-0" />
                    {!collapsed && <span className="truncate">Settings</span>}
                  </li>
                </Link>
              </Tip>
            </>
          )
        )}
      </ul>
    </div>
  )
}

export const SidebarFooter = () => {
  const { signOut, user } = useGithubAuth()
  const avatar_img = user?.avatar_url || duck
  const name = user?.name || user?.login || "User"
  const { org } = useParams({ strict: false })
  const {
    isTeacher,
    isStudent,
    isLoading: roleLoading,
  } = useCourseTeacherAccess(org)
  // Identity claim: only assert a role once resolved; placeholder while pending.
  // Stays conservative (blank) on transient errors while nav stays optimistic —
  // a deliberate split, not a bug.
  const roleLabel = roleLoading
    ? null
    : isTeacher
      ? "Teacher"
      : isStudent
        ? "Student"
        : null

  const [menuOpen, setMenuOpen] = useState(false)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const { collapsed } = useSidebarCollapse()

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!footerRef.current) return

      if (!footerRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [menuOpen])

  return (
    <div
      ref={footerRef}
      className="relative mt-auto cursor-pointer border-t border-[#444] py-4"
      onClick={() => setMenuOpen((open) => !open)}
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          setMenuOpen((open) => !open)
        }

        if (event.key === "Escape") {
          setMenuOpen(false)
        }
      }}
    >
      <div
        className={`
        absolute bottom-full z-50 mb-3
        ${collapsed ? "left-2 w-48" : "left-6 right-6"}
        origin-bottom rounded-box
        transition-all duration-150 ease-out

        ${
          menuOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }
      `}
        onClick={(event) => event.stopPropagation()}
      >
        <ul className="menu w-full rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-xl">
          <li>
            <a
              href="https://github.com/foundation50/classroom50/discussions"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircleQuestionMark className="size-4" />
              Classroom 50 Help
            </a>
          </li>

          <li>
            <button type="button" className="text-error" onClick={signOut}>
              <LogOut className="size-4" />
              Sign Out
            </button>
          </li>
        </ul>
      </div>

      <div
        className={`flex w-full items-center gap-4 text-left ${collapsed ? "justify-center" : "justify-start"}`}
        title={collapsed ? name : undefined}
      >
        <div className="avatar avatar-placeholder">
          <img
            src={avatar_img}
            alt={`${name}'s avatar`}
            className={`rounded-full ${collapsed ? "w-10" : "w-12"}`}
          />
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-white">{name}</div>

            {org ? (
              <div>
                <span className="text-[#aaa]">
                  {roleLoading ? (
                    <span className="skeleton inline-block h-3 w-16 align-middle bg-white/10" />
                  ) : (
                    roleLabel
                  )}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export const SidebarContent = ({ selected }: { selected: string }) => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { data: classData } = useGetClassroom(org, classroom)

  // Inside a single assignment the nav becomes assignment-scoped: show
  // assignment actions (and a back link) instead of the classroom menu.
  if (org && classroom && assignment) {
    return (
      <>
        <ClassroomLogo />
        <ExpandSidebarButton />
        <AssignmentSidebarMenu
          org={org}
          classroom={classroom}
          assignment={assignment}
        />
        <SidebarFooter />
      </>
    )
  }

  return (
    <>
      <ClassroomLogo />
      <ExpandSidebarButton />
      {org && <AllClasses org={org} />}
      <SidebarClassInfo classInfo={classData} />
      {org && classroom && (
        <TeacherSidebarMenu
          selected={selected}
          org={org}
          classroom={classroom}
        />
      )}
      <SidebarFooter />
    </>
  )
}

export const MyClasses = ({ settings = false, selected = "" }) => {
  const { org } = useParams({ strict: false })
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)
  const { collapsed } = useSidebarCollapse()
  const onSettings = settings || selected === "settings"
  if (!org) return null

  const classesLabel = showTeacherUi ? "My Classes" : "My Assignments"

  return (
    <div className="py-4">
      <ul className="flex flex-col gap-1">
        {!roleResolved ? (
          <li className="flex px-2 py-2">
            <span className="skeleton inline-block h-4 w-24 align-middle bg-white/10" />
          </li>
        ) : (
          <Tip label={classesLabel}>
            <Link to="/$org" params={{ org }}>
              <li
                aria-current={!onSettings ? "page" : undefined}
                className={navItemClass(!onSettings, collapsed)}
              >
                <BookText className="shrink-0" />
                {!collapsed && <span className="truncate">{classesLabel}</span>}
              </li>
            </Link>
          </Tip>
        )}
        {showTeacherUi && (
          <Tip label="Settings">
            <Link to="/$org/settings" params={{ org }}>
              <li
                aria-current={onSettings ? "page" : undefined}
                className={navItemClass(onSettings, collapsed)}
              >
                <Settings className="shrink-0" />
                {!collapsed && <span className="truncate">Settings</span>}
              </li>
            </Link>
          </Tip>
        )}
      </ul>
    </div>
  )
}

export const MyOrgs = ({ settings = false }) => {
  const { collapsed } = useSidebarCollapse()
  return (
    <div className="py-4">
      <ul className="flex flex-col gap-1">
        <Tip label="Organizations">
          <Link to="/">
            <li
              aria-current={!settings ? "page" : undefined}
              className={navItemClass(!settings, collapsed)}
            >
              <BookText className="shrink-0" />
              {!collapsed && <span className="truncate">Organizations</span>}
            </li>
          </Link>
        </Tip>
      </ul>
    </div>
  )
}

export const SidebarContentClasses = ({
  selected,
  settings = false,
}: {
  selected: string
  settings?: boolean
}) => {
  return (
    <>
      <ClassroomLogo />
      <ExpandSidebarButton />
      <MyClasses selected={selected} settings={settings} />
      <SidebarFooter />
    </>
  )
}

export const SidebarContentOrgs = ({ selected }: { selected: string }) => {
  return (
    <>
      <ClassroomLogo />
      <ExpandSidebarButton />
      <MyOrgs settings={selected === "settings"} />
      <SidebarFooter />
    </>
  )
}

export default Drawer
