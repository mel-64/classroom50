import { HardDriveUpload, X } from "lucide-react"
import { useRef, useState } from "react"

import Papa from "papaparse"
import { bulkEnrollStudentsInClassroom } from "@/hooks/github/mutations"
import type { GitHubClient } from "@/hooks/github/client"
import {
  isLikelyGithubUsername,
  normalizeGithubUsername,
  type BulkImportResult,
} from "@/api/mutations/students"

const parseUsernameImportFile = (text: string): string[] => {
  const trimmed = text.trim()

  if (!trimmed) return []

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    delimiter: "",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  })

  let candidates: string[] = []

  if (
    parsed.errors.length === 0 &&
    parsed.meta.fields?.some((field) => field.toLowerCase() === "username")
  ) {
    candidates = parsed.data.map((row) => row.username ?? "")
  } else {
    candidates = trimmed.split(/\r?\n/)
  }

  const seen = new Set<string>()
  const usernames: string[] = []

  for (const candidate of candidates) {
    const username = normalizeGithubUsername(candidate)

    if (!username || !isLikelyGithubUsername(username)) {
      continue
    }

    const key = username.toLowerCase()

    if (seen.has(key)) continue

    seen.add(key)
    usernames.push(username)
  }

  return usernames
}

type UploadRosterProps = {
  org: string
  classroom: string
  client: GitHubClient
  onSuccess?: (result: BulkImportResult) => void
}
type ImportPhase = "idle" | "preview" | "importing" | "complete" | "error"
type ImportProgress = {
  processed: number
  total: number
  message: string
}

const ImportResultSection = ({
  title,
  rows,
}: {
  title: string
  rows: {
    key: string
    label: string
    detail?: string
  }[]
}) => {
  return (
    <div>
      <h4 className="font-bold mb-2">{title}</h4>

      <div className="max-h-48 overflow-auto rounded-box border border-base-300">
        <table className="table table-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <code>{row.key}</code>
                </td>
                <td className="opacity-70">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const UploadRoster = ({
  org,
  classroom,
  client,
  onSuccess,
}: UploadRosterProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [phase, setPhase] = useState<ImportPhase>("idle")
  const [fileName, setFileName] = useState("")
  const [usernames, setUsernames] = useState<string[]>([])
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: 0,
    message: "",
  })
  const [result, setResult] = useState<BulkImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isOpen = phase !== "idle"

  const reset = () => {
    setPhase("idle")
    setFileName("")
    setUsernames([])
    setProgress({
      processed: 0,
      total: 0,
      message: "",
    })
    setResult(null)
    setError(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) return

    try {
      const text = await file.text()
      const parsedUsernames = parseUsernameImportFile(text)

      setFileName(file.name)
      setUsernames(parsedUsernames)
      setResult(null)
      setError(null)
      setProgress({
        processed: 0,
        total: parsedUsernames.length,
        message: "",
      })
      setPhase("preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file")
      setPhase("error")
    } finally {
      input.value = ""
    }
  }

  const startImport = async () => {
    setPhase("importing")
    setError(null)
    setResult(null)
    setProgress({
      processed: 0,
      total: usernames.length,
      message: "Starting import...",
    })

    try {
      const importResult = await bulkEnrollStudentsInClassroom(client, {
        org,
        classroom,
        usernames,
        onProgress: setProgress,
      })

      setResult(importResult)
      setPhase("complete")
      onSuccess?.(importResult)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Import failed")
      setPhase("error")
    }
  }

  const progressPercent =
    progress.total === 0
      ? 0
      : Math.round((progress.processed / progress.total) * 100)

  return (
    <>
      <div className="card card-border bg-base-100 shadow-sm">
        <div className="card-body">
          <p className="font-bold">Upload Roster</p>
          <span>
            Upload a CSV or text file with one GitHub username per line.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn"
          >
            <HardDriveUpload />
            Choose File
          </button>
          <p className="text-center text-[#aaa] text-sm">
            Supported: .csv, .txt
          </p>
        </div>
      </div>

      {isOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">Import Students</h3>
                {fileName && (
                  <p className="text-sm opacity-70 mt-1">File: {fileName}</p>
                )}
              </div>

              {phase !== "importing" && (
                <button
                  type="button"
                  className="btn btn-sm btn-circle btn-ghost"
                  onClick={reset}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {phase === "preview" && (
              <div className="mt-6">
                <div className="alert mb-4">
                  <span>
                    Found <strong>{usernames.length}</strong> GitHub usernames
                    {usernames.length === 1 ? "" : "s"} to import.
                  </span>
                </div>

                {usernames.length > 0 ? (
                  <div className="max-h-80 overflow-auto rounded-box border border-base-300">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>GitHub username</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usernames.map((username, index) => (
                          <tr key={username.toLowerCase()}>
                            <td>{index + 1}</td>
                            <td>
                              <code>{username}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    No valid GitHub usernames were found in this file.
                  </div>
                )}

                <div className="modal-action">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={reset}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={usernames.length === 0}
                    onClick={startImport}
                  >
                    Import {usernames.length} student
                    {usernames.length === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            )}

            {phase === "importing" && (
              <div className="mt-6">
                <p className="mb-2 font-medium">{progress.message}</p>

                <progress
                  className="progress progress-primary w-full"
                  value={progress.processed}
                  max={progress.total || 1}
                />

                <div className="mt-2 flex justify-between text-sm opacity-70">
                  <span>
                    {progress.processed} / {progress.total} processed
                  </span>
                  <span>{progressPercent}%</span>
                </div>

                <div className="mt-6 alert">
                  <span>
                    Keep this tab open while the import is running. Students are
                    being validated and added to the classroom.
                  </span>
                </div>
              </div>
            )}

            {phase === "complete" && result && (
              <div className="mt-6 space-y-4">
                <div className="alert alert-success">
                  <span>
                    Added <strong>{result.addedStudents.length}</strong> student
                    {result.addedStudents.length === 1 ? "" : "s"}
                  </span>
                </div>

                {result.addedStudents.length > 0 && (
                  <ImportResultSection
                    title="Added"
                    rows={result.addedStudents.map((student) => ({
                      key: student.username,
                      label: student.username,
                      detail: [student.first_name, student.last_name]
                        .filter(Boolean)
                        .join(" "),
                    }))}
                  />
                )}

                {result.skippedStudents.length > 0 && (
                  <ImportResultSection
                    title="Skipped"
                    rows={result.skippedStudents.map((student) => ({
                      key: student.username,
                      label: student.username,
                      detail: student.message ?? student.reason,
                    }))}
                  />
                )}

                {result.teamResults?.some(
                  (teamResult) => teamResult.status === "failed",
                ) && (
                  <ImportResultSection
                    title="Team add failures"
                    rows={result.teamResults
                      .filter((teamResult) => teamResult.status === "failed")
                      .map((teamResult) => ({
                        key: teamResult.username,
                        label: teamResult.username,
                        detail:
                          teamResult.message ??
                          "Could not add this user to the team",
                      }))}
                  />
                )}

                <div className="modal-action">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={reset}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="mt-6">
                <div className="alert alert-error">
                  <span>{error ?? "Something went wrong."}</span>
                </div>

                <div className="modal-action">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={reset}
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose another file
                  </button>
                </div>
              </div>
            )}
          </div>

          <form method="dialog" className="modal-backdrop">
            {phase !== "importing" && (
              <button type="button" onClick={reset}>
                close
              </button>
            )}
          </form>
        </dialog>
      )}
    </>
  )
}

export default UploadRoster
