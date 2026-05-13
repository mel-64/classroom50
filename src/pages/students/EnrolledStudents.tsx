import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'
import GitHub from '@/assets/github.svg?react'

const students = [
  { name: 'Andre D.', github: 'student-andre', initials: 'AD' },
  { name: 'Andrew M.', github: 'student-andrew', initials: 'AM' },
  { name: 'Anil M.', github: 'student-anil', initials: 'AM' },
  { name: 'Christina K.', github: 'student-christina', initials: 'CK' },
  { name: 'Douglas W.', github: 'student-douglas', initials: 'DW' },
  { name: 'Frank R.', github: 'student-frank', initials: 'FR' },
  { name: 'Jessica M.', github: 'student-jessica', initials: 'JM' },
  { name: 'Kayla B.', github: 'student-kayla', initials: 'KB' },
  { name: 'Mark H.', github: 'student-mark', initials: 'MH' },
  { name: 'Michael B.', github: 'student-michael', initials: 'MB' },
  { name: 'Nichole H.', github: 'student-nichole', initials: 'NH' },
  { name: 'Paul R.', github: 'student-paul', initials: 'PR' }
]

const EnrolledStudents = () => (
  <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
    <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
      <h2 className="text-lg font-semibold">Enrolled Students</h2>

      <div className="badge badge-primary badge-soft text-base">
        12
      </div>
    </div>

    <ul className="divide-y divide-base-300">
      {students.map((student) => (
        <li
          key={student.github}
          className="flex items-center gap-4 px-6 py-4"
        >
          <div className="avatar avatar-placeholder">
            <div className="bg-base-200 text-primary rounded-full w-12">
              <span>{student.initials}</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="font-medium text-base-content">
              {student.name}
            </div>

            <div className="flex items-center gap-1 text-sm text-base-content/60">
              <GitHub className="size-4" />
              <span>{student.github}</span>
            </div>
          </div>

          <button className="btn btn-ghost btn-square text-error">
            <Trash />
          </button>
        </li>
      ))}
    </ul>
  </div>
)

export default EnrolledStudents
