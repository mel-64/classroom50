import { GraduationCap, BookText, UsersRound } from "lucide-react"
import { Link, useParams } from "@tanstack/react-router"
import { useGithubAuth } from "../../auth/useGithubAuth"
import duck from "@/assets/duck.png"
import { useCourseTeacherAccess } from "../../hooks/useCourseTeacherAccess"
import useGetClassroom from "@/hooks/useGetClassroom"

const Drawer = ({ children }) => (
  <div className="drawer lg:drawer-open">{children}</div>
)

export const DrawerContent = ({ children, className }) => (
  <div className={`${className} drawer-content`}>{children}</div>
)
export const DrawerToggle = () => <div className="drawer-toggle"></div>

export const DrawerSidebar = ({ selected, page }) => {
  return (
    <div className="drawer-side bg-[#212a3a] text-white">
      <div className="flex flex-col min-h-full w-60 min-w-30 [&>div]:px-6">
        {page === "classes" ? (
          <SidebarContentClasses />
        ) : (
          <SidebarContent selected={selected} />
        )}
      </div>
    </div>
  )
}

export const TeacherLogo = () => {
  return (
    <div className="flex p-6 text-lg text-white font-bold border-b-1 border-[#444]">
      <GraduationCap className="size-8 text-[#accefb] mr-2" /> Teacher
    </div>
  )
}

export const AllClasses = ({ org }) => {
  return (
    <div className="py-4 text-sm">
      <Link to={`/${org}/classes`} className="text-center">
        ‹ All Classes
      </Link>
    </div>
  )
}

export const SidebarClassInfo = ({ classInfo }) => {
  return (
    <div className="py-2">
      <h3 className="font-bold">
        {classInfo?.name || classInfo?.short_name || "Untitled Course"}
      </h3>
      <p className="text-gray-500 text-sm">
        {classInfo?.term || "Unspecified Term"}
      </p>
    </div>
  )
}

export const TeacherSidebarMenu = ({ org, classroom, selected }) => {
  return (
    <div className="py-4">
      <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
        <Link to={`/${org}/${classroom}/assignments`}>
          <li
            className={`flex ${selected === "assignments" && "bg-[#323b49]"}`}
          >
            <BookText />
            <span>Assignments</span>
          </li>
        </Link>
        <Link to={`/${org}/${classroom}/students`}>
          <li className={`flex ${selected === "students" && "bg-[#323b49]"}`}>
            <UsersRound />
            <span>Students</span>
          </li>
        </Link>
      </ul>
    </div>
  )
}

// keep first name as-is, truncate all others with a period
const truncateName = (name: string) => {
  if (!name) return ""

  const truncatedName = name
    .split(" ")
    .map((n, i) => (i === 0 ? n : n.slice(0, 1) + "."))
    .join(" ")

  return truncatedName
}

export const SidebarFooter = () => {
  const { user } = useGithubAuth()
  const avatar_img = user?.avatar_url || duck
  const name = truncateName(user?.name || "") || "User"
  const { org } = useParams({ strict: false })
  const { isTeacher } = useCourseTeacherAccess(org)

  return (
    <div className="mt-auto border-t border-[#444] py-4">
      <div className="flex justify-start gap-4">
        <div className="avatar avatar-placeholder">
          <img src={avatar_img} className="w-12 rounded-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white">{name}</div>

          <div>
            <span className="text-[#aaa]">
              {isTeacher ? "Teacher" : "Student"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SidebarContent = ({ selected }: { selected: boolean }) => {
  const { org, classroom } = useParams({ strict: false })
  const { data: classData } = useGetClassroom(org, classroom)

  return (
    <>
      <TeacherLogo />
      <AllClasses org={org} />
      <SidebarClassInfo classInfo={classData} />
      <TeacherSidebarMenu selected={selected} org={org} classroom={classroom} />
      <SidebarFooter />
    </>
  )
}

export const MyClasses = () => {
  return (
    <div className="py-4">
      <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
        <Link to="/cs50/cs50-2026/students">
          <li className="flex bg-[#323b49]">
            <BookText />
            <span>My Classes</span>
          </li>
        </Link>
      </ul>
    </div>
  )
}

export const SidebarContentClasses = () => {
  return (
    <>
      <TeacherLogo />
      <MyClasses />
      <SidebarFooter />
    </>
  )
}

export default Drawer
