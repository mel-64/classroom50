import { useMutation } from "@tanstack/react-query"
import CreateAssignmentForm, {
  assignmentToFormValues,
} from "./CreateAssignmentForm"
import {
  editAssignmentWithConflictRetry,
  type CreateAssignmentInput,
  type CreateAssignmentResult,
} from "@/api/mutations/assignments"
import { GitHubAPIError } from "@/hooks/github/errors"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const EditAssignmentForm = ({
  org,
  classroom,
  assignment,
  defaultData,
  onSuccess,
  onError,
  onMutate,
}: {
  org: string
  classroom: string
  assignment: string
  defaultData: Parameters<typeof assignmentToFormValues>[0] | undefined
  onSuccess: (result: CreateAssignmentResult) => void
  onError?: (error: GitHubAPIError) => void
  onMutate?: () => void
}) => {
  const client = useGitHubClient()
  const editAssignmentMutation = useMutation<
    CreateAssignmentResult,
    GitHubAPIError,
    CreateAssignmentInput
  >({
    mutationFn: (input) => editAssignmentWithConflictRetry(client, input),
    onMutate,
    onSuccess,
    onError,
  })

  if (!defaultData) {
    return (
      <div className="flex">
        <div className="m-auto loading loading-spinner" />
      </div>
    )
  }

  return (
    <CreateAssignmentForm
      edit
      loading={editAssignmentMutation.isPending}
      org={org}
      defaultValues={assignmentToFormValues(defaultData)}
      onSubmit={(values) => {
        editAssignmentMutation.mutate({
          name: values.name,
          mode: values.mode,
          org,
          template_repo: values.template_repo,
          description: values.description,
          due_date: values.due_date,
          max_group_size: values.max_group_size,
          feedback_pr: values.feedback_pr,
          runs_on: values.runs_on,
          container_image: values.container_image,
          container_user: values.container_user,
          setup_command: values.setup_command,
          classroom,
          tests: values.tests,
          slug: assignment,
        })
      }}
    />
  )
}

export default EditAssignmentForm
