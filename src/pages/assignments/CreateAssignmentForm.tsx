import GitHub from '@/assets/github.svg?react'

const CreateAssignmentForm = ({ children }) => {
  return (
    <div className="card bg-base-100 w-full shadow-sm">
      <div className="card-body">
        <h3 className="text-lg font-bold pb-4">Basic Information</h3>
        <label className="label font-bold">Assignment Name<span className="text-[#f00]">*</span></label>
        <input type="text" className="input w-full mb-4" placeholder="e.g., Loops Assignment" />

        <label className="label font-bold">Description</label>
        <textarea className="textarea w-full mb-4" placeholder="Describe the assignment objectives..." />

        <div className="flex justify-between mb-4">
          <div>
            <div>
              <label className="label font-bold mb-2">Template Repository<span className="text-[#f00]">*</span></label>
            </div>
            <div className="flex">
              <GitHub className="size-6 mr-2 text-[#ddd] opacity-50" />
              <input type="text" placeholder="org-name/repo-name" className="input" />
            </div>
            <p className="label pt-2">Students will receive a copy of this repository.</p>
          </div>
          <div>
            <label className="label font-bold mb-2">Due Date</label>
            <input type="date" className="input" />
          </div>
        </div>

        <div>
          <div>
            <label className="label font-bold mb-2">Assignment Type</label>
          </div>
          <input type="radio" className="radio" checked /><label className="label pl-2">Individual</label>
          <input type="radio" className="radio ml-6" /><label className="label pl-2">Group Project</label>
        </div>
      </div>
    </div>
  )
}

export default CreateAssignmentForm
