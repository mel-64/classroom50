import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import Breadcrumb from '@/components/breadcrumb'
import Drawer, { DrawerContent, DrawerToggle } from '@/components/drawer'
import EnrolledStudents from '@/pages/students/EnrolledStudents'
import UploadRoster from '@/pages/students/UploadRoster'

const StudentListPage = () => {
  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <Breadcrumb />
          <h1 className="text-lg pt-8 pb-2 font-bold">Students</h1>
          <h3 className="pb-10">12 students enrolled in AP CS Principles</h3>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 px-4">
              <AddByGithubUsername className="mb-8" />
              <UploadRoster />
            </div>
            <div className="col-span-7 px-4">
              <EnrolledStudents />
            </div>
          </div>
        </DrawerContent>
        <div className="drawer-side bg-[#212a3a] text-white">
          <div className="flex flex-col min-h-full w-60 min-w-30 [&>div]:px-6">
            <div className="flex p-6 text-lg text-white font-bold border-b-1 border-[#444]">
              <GraduationCap className="size-8 text-[#accefb] mr-2" /> Teacher
            </div>
            <div className="py-4 text-sm">
              <Link to='/classes' className="text-center">‹ All Classes</Link>
            </div>
            <div className="py-2">
              <h3 className="font-bold">AP CS Principles</h3>
              <p className="text-gray-500 text-sm">Spring 2026</p>
            </div>
            <div className="py-4">
              <ul className="[&>li]:py-2 [&>li>span]:pl-2">
                <li className="flex">
                  <BookText />
                  <span>Assignments</span>
                </li>
                <li className="flex">
                  <UsersRound />
                  <span>Students</span>
                </li>
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
      </Drawer>
    </div>
  )
}

export default StudentListPage
