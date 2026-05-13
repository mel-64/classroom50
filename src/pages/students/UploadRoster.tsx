import { GraduationCap, BookText, Trash, UsersRound, UserRound, HardDriveUpload } from 'lucide-react'

const UploadRoster = () => (
  <div className="card card-border w-96 bg-base-100 shadow-sm">
    <div className="card-body">
      <p className="font-bold">Upload Roster</p>
      <span>Upload a CSV or text file with one GitHub username per line.</span>
      <button className="btn"><HardDriveUpload />Choose File</button>
      <p className="text-center text-[#aaa] text-sm">Supported: .csv, .txt</p>
    </div>
  </div>
)

export default UploadRoster
