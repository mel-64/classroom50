import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'

const Drawer = ({ children }) => <div className="drawer lg:drawer-open">{children}</div>

export const DrawerContent = ({ children, className }) => <div className={`${className} drawer-content`}>{children}</div>
export const DrawerToggle = () => <div className="drawer-toggle"></div>

export const DrawerSidebar = ({ selected, children }) => {
  return (
    <div className="drawer-side bg-[#212a3a] text-white">
      <div className="flex flex-col min-h-full w-60 min-w-30 [&>div]:px-6">
        <div className="flex p-6 text-lg text-white font-bold border-b-1 border-[#444]">
          <GraduationCap className="size-8 text-[#accefb] mr-2" /> Teacher
        </div>
        <div className="py-4 text-sm">
          <Link to="/cs50/classes" className="text-center">‹ All Classes</Link>
        </div>
        <div className="py-2">
          <h3 className="font-bold">AP CS Principles</h3>
          <p className="text-gray-500 text-sm">Spring 2026</p>
        </div>
        <div className="py-4">
          <ul className="[&>a>li]:py-2 [&>a>li>span]:pl-2">
            <Link to='/cs50/cs50-2026/assignments'>
              <li className={`flex ${selected === 'assignments' && 'bg-[#323b49]'}`}>
                <BookText />
                <span>Assignments</span>
              </li>
            </Link>
            <Link to='/cs50/cs50-2026/students'>
              <li className={`flex ${selected === 'students' && 'bg-[#323b49]'}`}>
                <UsersRound />
                <span>Students</span>
              </li>
            </Link>
          </ul>
        </div>
        <div className="mt-auto border-t-1 border-[#444] py-4">
          <div className="flex justify-start gap-4">
            <div className="avatar avatar-placeholder">
              <div className="bg-base-200 text-primary rounded-full w-12">
                <span className="text-black">SR</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-base-content text-white">
                Sally R.
              </div>

              <div>
                <span className="text-[#aaa]">Teacher</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Drawer
