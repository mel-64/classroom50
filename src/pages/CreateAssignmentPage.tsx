import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import AssignmentsTable from '@/pages/assignments/AssignmentsTable'
import AutogradingTestsPane from '@/pages/assignments/AutogradingTestsPane'
import Breadcrumb from '@/components/breadcrumb'
import CreateAssignmentForm from '@/pages/assignments/CreateAssignmentForm'
import Drawer, { DrawerContent, DrawerSidebar, DrawerToggle } from '@/components/drawer'
import EnrolledStudents from '@/pages/students/EnrolledStudents'
import UploadRoster from '@/pages/students/UploadRoster'

const CreateAssignmentPage = () => {
  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <Breadcrumb />
          <div className="flex justify-between">
            <div>
              <h1 className="text-xl pt-8 pb-10 font-bold">Create Assignment</h1>
            </div>
          </div>
          <CreateAssignmentForm />
          <AutogradingTestsPane />
        </DrawerContent>
        <DrawerSidebar selected='assignments' />
      </Drawer>
    </div>
  )
}

export default CreateAssignmentPage
