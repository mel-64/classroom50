import { ArrowDownWideNarrow, GraduationCap, BookText, HardDriveDownload, Trash, UsersRound, UserRound } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import GitHub from '@/assets/github.svg?react'

import AddByGithubUsername from '@/pages/students/AddByGithubUsername'
import AssignmentsTable from '@/pages/assignments/AssignmentsTable'
import Breadcrumb from '@/components/breadcrumb'
import Drawer, { DrawerContent, DrawerSidebar, DrawerToggle } from '@/components/drawer'
import EnrolledStudents from '@/pages/students/EnrolledStudents'
import SubmissionsTable from '@/pages/submissions/SubmissionsTable'
import UploadRoster from '@/pages/students/UploadRoster'

const SubmissionsPage = ({ children }) => {
  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <Breadcrumb submissions />
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">Loops Assignment</h1>
              <div className="flex pb-10">
                <label>8 of 28 submitted</label>
                <label className="px-2"> • </label>
                <ArrowDownWideNarrow />
                <label>Sorted by most recent</label>
              </div>
            </div>
            <div className="pt-10">
              <button className="btn btn-outline"><HardDriveDownload /> Download Scores (CSV)</button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">Submitted</label> 
                <div className="flex items-end gap-1">
                  <h2 className="text-xl font-bold">8</h2>
                  /
                  <h4>28</h4>
                </div>
              </div>
            </div>
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">Class Average</label> 
                <div className="flex items-end gap-1">
                  <h2 className="text-xl font-bold">8</h2>
                  /
                  <h4>28</h4>
                </div>
              </div>
            </div>
          </div>
          <SubmissionsTable />
        </DrawerContent>
        <DrawerSidebar selected='assignments' />
      </Drawer>
    </div>
  )
}

export default SubmissionsPage
