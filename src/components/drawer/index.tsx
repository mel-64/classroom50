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
  FilePlus2,
  Globe,
} from "lucide-react"
import {
  Link,
  useParams,
  useMatchRoute,
  useMatch,
} from "@tanstack/react-router"
import { useGithubAuth } from "../../auth/useGithubAuth"
import duck from "@/assets/duck.png"
import { useCourseTeacherAccess } from "../../hooks/useCourseTeacherAccess"
import useGetClassroom from "@/hooks/useGetClassroom"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import useDotClassroom50 from "@/hooks/useDotClassroom50"
import { studentRepoName } from "@/util/studentRepo"
import useGetAssignmentRepo from "@/hooks/useGetAssignmentRepo"
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

// Inner markup of a sidebar nav row. Callers keep their own typed
// <Link to params> wrapping this so router type inference stays intact.
const SidebarItemBody = ({
  label,
  icon,
  active,
}: {
  label: string
  icon: ReactNode
  active: boolean
}) => {
  const { collapsed } = useSidebarCollapse()
  return (
    <li
      aria-current={active ? "page" : undefined}
      className={navItemClass(active, collapsed)}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </li>
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
  const { user } = useGithubAuth()

  // Resolve the display name from whichever source the role can read. The
  // teacher config-repo source is gated on role so a student doesn't fire a
  // guaranteed 404; the public Pages source covers the student (and is a
  // teacher fallback before Pages publishes).
  const { data: teacherAssignments } = useGetClassroomAssignments(
    org,
    classroom,
    { enabled: showTeacherUi },
  )
  // For a protected classroom the public Pages fetch needs the capability
  // secret. A student reads it from their own repo's .classroom50.yaml (the
  // only source they can access); a teacher gets it from classroom.json.
  const studentRepoNameForSecret = user?.login
    ? studentRepoName(classroom, assignment, user.login)
    : ""
  const { secret: studentSecret } = useDotClassroom50(
    org,
    studentRepoNameForSecret,
  )
  const { data: classroomMeta } = useGetClassroom(org, classroom, {
    enabled: showTeacherUi,
  })
  const secret = studentSecret || classroomMeta?.secret
  const { assignment: publicAssignment } = useGetPublicAssignment(
    org,
    classroom,
    assignment,
    secret,
  )
  const assignmentName =
    teacherAssignments?.assignments.find((a) => a.slug === assignment)?.name ||
    publicAssignment?.name ||
    assignment

  // Group assignments give students something to manage (collaborators);
  // individual assignments have nothing student-editable, so we omit the
  // settings entry rather than route them to a dead-end.
  const isGroupAssignment = publicAssignment?.mode === "group"

  const onRoute = (to: Parameters<typeof matchRoute>[0]["to"]) =>
    Boolean(matchRoute({ to, fuzzy: false }))

  const onSubmissions =
    onRoute("/$org/$classroom/assignments/$assignment/submissions") ||
    onRoute("/$org/$classroom/assignments/$assignment")
  const onSubmission = onRoute(
    "/$org/$classroom/assignments/$assignment/submission",
  )
  const onSettings = onRoute("/$org/$classroom/assignments/$assignment/edit")
  const onAccept = onRoute("/$org/$classroom/assignments/$assignment/accept")

  // Students only: surface "Accept" until they have their repo. Hidden while
  // loading to avoid a flash that then disappears once we learn they accepted.
  const { assignment: studentRepo, isLoading: repoLoading } =
    useGetAssignmentRepo(org, classroom, assignment, user?.login)
  const showAccept =
    !showTeacherUi && roleResolved && !repoLoading && !studentRepo

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
                  <SidebarItemBody
                    label="Submissions"
                    icon={<UsersRound />}
                    active={onSubmissions}
                  />
                </Link>
              </Tip>
              <Tip label="Assignment Settings">
                <Link
                  to="/$org/$classroom/assignments/$assignment/edit"
                  params={{ org, classroom, assignment }}
                >
                  <SidebarItemBody
                    label="Assignment Settings"
                    icon={<Settings />}
                    active={onSettings}
                  />
                </Link>
              </Tip>
            </>
          ) : (
            <>
              {showAccept && (
                <Tip label="Accept Assignment">
                  <Link
                    to="/$org/$classroom/assignments/$assignment/accept"
                    params={{ org, classroom, assignment }}
                  >
                    <SidebarItemBody
                      label="Accept Assignment"
                      icon={<FilePlus2 />}
                      active={onAccept}
                    />
                  </Link>
                </Tip>
              )}
              <Tip label="My Submission">
                <Link
                  to="/$org/$classroom/assignments/$assignment/submission"
                  params={{ org, classroom, assignment }}
                >
                  <SidebarItemBody
                    label="My Submission"
                    icon={<FileCheck2 />}
                    active={onSubmission}
                  />
                </Link>
              </Tip>
              {isGroupAssignment && (
                <Tip label="Manage Group">
                  <Link
                    to="/$org/$classroom/assignments/$assignment/edit"
                    params={{ org, classroom, assignment }}
                  >
                    <SidebarItemBody
                      label="Manage Group"
                      icon={<UsersRound />}
                      active={onSettings}
                    />
                  </Link>
                </Tip>
              )}
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

  return (
    <div className="py-4">
      <ul className="flex flex-col gap-1">
        <Tip label="Assignments">
          <Link to="/$org/$classroom/assignments" params={{ org, classroom }}>
            <SidebarItemBody
              label="Assignments"
              icon={<BookText />}
              active={selected === "assignments"}
            />
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
                  <SidebarItemBody
                    label="Students"
                    icon={<UsersRound />}
                    active={selected === "students"}
                  />
                </Link>
              </Tip>
              <Tip label="Settings">
                <Link to="/$org/$classroom/edit" params={{ org, classroom }}>
                  <SidebarItemBody
                    label="Settings"
                    icon={<Settings />}
                    active={selected === "settings"}
                  />
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
  const isOrgSetup = !!useMatch({
    from: "/_authed/$org/setup/",
    shouldThrow: false,
  })
  const {
    isTeacher,
    isStudent,
    isLoading: roleLoading,
  } = useCourseTeacherAccess(org)
  // Only assert a role once one is known; blank while pending or on a
  // transient error rather than guessing.
  const roleLabel = roleLoading
    ? null
    : isTeacher || isOrgSetup
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
  const onSettings = settings || selected === "settings"
  const onPublished = selected === "published"
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
              <SidebarItemBody
                label={classesLabel}
                icon={<BookText />}
                active={!onSettings && !onPublished}
              />
            </Link>
          </Tip>
        )}
        {showTeacherUi && (
          <Tip label="Published">
            <Link to="/$org/published" params={{ org }}>
              <SidebarItemBody
                label="Published"
                icon={<Globe />}
                active={onPublished}
              />
            </Link>
          </Tip>
        )}
        {showTeacherUi && (
          <Tip label="Settings">
            <Link to="/$org/settings" params={{ org }}>
              <SidebarItemBody
                label="Settings"
                icon={<Settings />}
                active={onSettings}
              />
            </Link>
          </Tip>
        )}
      </ul>
    </div>
  )
}

export const MyOrgs = ({ settings = false }) => {
  return (
    <div className="py-4">
      <ul className="flex flex-col gap-1">
        <Tip label="Organizations">
          <Link to="/">
            <SidebarItemBody
              label="Organizations"
              icon={<BookText />}
              active={!settings}
            />
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
