import { UserRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"
import { useForm } from "@tanstack/react-form"

type AddByGithubUsernameProps = {
  className?: string
  org: string
  classroom: string
}
const AddByGithubUsername = ({
  className = "",
  org,
  classroom,
}: AddByGithubUsernameProps) => {
  const form = useForm({})

  return (
    <div className={`card card-border w-96 bg-base-100 shadow-sm ${className}`}>
      <form>
        <div className="card-body">
          <p className="font-bold mb-2">Add by GitHub Username</p>
          <form>
            <div className="flex mb-2">
              <UserRound className="mr-2 text-[#bbb]" />
              <input
                type="text"
                placeholder="Name (optional)"
                className="input"
              />
            </div>
            <div className="flex mb-4">
              <GitHub className="size-6 mr-2 text-[#ddd] opacity-25" />
              <input
                type="text"
                placeholder="github-username"
                className="input"
              />
            </div>
            <button className="btn btn-primary w-full bg-[#4e80ee]">
              + Add Student
            </button>
          </form>
        </div>
      </form>
    </div>
  )
}

export default AddByGithubUsername
