import { Trash } from "lucide-react"

import { getName, getInitials } from "@/util/students"
import Avatar from "@/components/avatar"

const EnrolledStudents = ({ students }) => (
  <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
    <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
      <h2 className="text-lg font-semibold">Enrolled Students</h2>

      <div className="badge badge-primary badge-soft text-base">12</div>
    </div>

    <ul className="divide-y divide-base-300">
      {students?.map(({ username }) => (
        <li
          key={username}
          className="flex items-center gap-4 px-6 py-4 justify-between"
        >
          <Avatar
            name={getName(username, students)}
            github={username}
            initials={getInitials(username, students)}
          />
          <button className="btn btn-ghost btn-square text-error">
            <Trash />
          </button>
        </li>
      ))}
    </ul>
  </div>
)

export default EnrolledStudents
