import {
  GraduationCap,
  BookText,
  UsersRound,
  LogOut,
  MessageCircleQuestionMark,
  Settings,
} from "lucide-react"
import { Link, useParams } from "@tanstack/react-router"
import { useGithubAuth } from "../../auth/useGithubAuth"
import duck from "@/assets/duck.png"
import { useCourseTeacherAccess } from "../../hooks/useCourseTeacherAccess"
import useGetClassroom from "@/hooks/useGetClassroom"
import type { Classroom } from "@/types/classroom"
import { useEffect, useRef, useState, type ReactNode } from "react"

const Drawer = ({ children }: { children: ReactNode }) => (
  <div className="drawer lg:drawer-open">{children}</div>
)

export const DrawerContent = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => <div className={`${className} drawer-content`}>{children}</div>
export const DrawerToggle = () => <div className="drawer-toggle"></div>

export const DrawerSidebar = ({
  selected = "",
  page = "",
  settings = false,
}) => {
  return (
    <div className="drawer-side bg-[#212a3a] text-white">
      <div className="flex flex-col min-h-full w-60 min-w-30 [&>div]:px-6">
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

export const ClassroomLogo = () => {
  return (
    <Link
      to="/"
      className="flex p-6 text-lg text-white font-bold border-b-1 border-[#444]"
    >
      <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
    </Link>
  )
}

export const AllClasses = ({ org }: { org: string }) => {
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
      <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
        <Link
          to="/$org/$classroom/assignments"
          params={{ org, classroom }}
        >
          <li
            className={`flex px-2 ${selected === "assignments" && "bg-[#323b49] rounded-box"}`}
          >
            <BookText />
            <span>Assignments</span>
          </li>
        </Link>
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
              <Link to="/$org/$classroom/students" params={{ org, classroom }}>
                <li
                  className={`flex px-2 ${selected === "students" && "bg-[#323b49] rounded-box"}`}
                >
                  <UsersRound />
                  <span>Students</span>
                </li>
              </Link>
              <Link to="/$org/$classroom/edit" params={{ org, classroom }}>
                <li
                  className={`flex px-2 ${selected === "settings" && "bg-[#323b49] rounded-box"}`}
                >
                  <Settings />
                  <span>Settings</span>
                </li>
              </Link>
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
  const { isTeacher, isStudent, isLoading: roleLoading } =
    useCourseTeacherAccess(org)
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
        absolute bottom-full left-6 right-6 z-50 mb-3
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

      <div className="flex w-full items-center justify-start gap-4 text-left">
        <div className="avatar avatar-placeholder">
          <img
            src={avatar_img}
            alt={`${name}'s avatar`}
            className="w-12 rounded-full"
          />
        </div>

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
      </div>
    </div>
  )
}

export const SidebarContent = ({ selected }: { selected: string }) => {
  const { org, classroom } = useParams({ strict: false })
  const { data: classData } = useGetClassroom(org, classroom)

  return (
    <>
      <ClassroomLogo />
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
  if (!org) return null
  return (
    <div className="py-4">
      <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
        <Link to="/$org" params={{ org }}>
          <li
            className={`flex px-2 rounded-box${onSettings ? "" : " bg-[#323b49]"}`}
          >
            <BookText />
            <span>
              {!roleResolved ? (
                <span className="skeleton inline-block h-4 w-24 align-middle bg-white/10" />
              ) : showTeacherUi ? (
                "My Classes"
              ) : (
                "My Assignments"
              )}
            </span>
          </li>
        </Link>
        {showTeacherUi && (
          <Link to="/$org/settings" params={{ org }}>
            <li
              className={`flex px-2 rounded-box${onSettings ? " bg-[#323b49]" : ""}`}
            >
              <Settings />
              <span>Settings</span>
            </li>
          </Link>
        )}
      </ul>
    </div>
  )
}

export const MyOrgs = ({ settings = false }) => {
  return (
    <div className="py-4">
      <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
        <Link to="/">
          <li
            className={`flex${!settings ? " bg-[#323b49]" : ""} px-2 rounded-box`}
          >
            <BookText />
            <span>Organizations</span>
          </li>
        </Link>
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
      <MyClasses selected={selected} settings={settings} />
      <SidebarFooter />
    </>
  )
}

export const SidebarContentOrgs = ({ selected }: { selected: string }) => {
  return (
    <>
      <ClassroomLogo />
      <MyOrgs settings={selected === "settings"} />
      <SidebarFooter />
    </>
  )
}

export default Drawer
