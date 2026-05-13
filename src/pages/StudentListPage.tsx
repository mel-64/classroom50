import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import Breadcrumb from '@/components/breadcrumb'
import Drawer, { DrawerContent, DrawerSidebar, DrawerToggle } from '@/components/drawer'
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
        <DrawerSidebar selected='students' />
      </Drawer>
    </div>
  )
}

export default StudentListPage
