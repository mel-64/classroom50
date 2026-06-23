import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

import type { DeviceAuthState } from "./types"

function StepNumber({ value, done }: { value: number; done: boolean }) {
  return (
    <div
      className={[
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        done
          ? "bg-success/10 text-success"
          : "bg-primary/10 text-primary",
      ].join(" ")}
    >
      {done ? <Check className="size-4" /> : value}
    </div>
  )
}

export function GitHubDevicePrompt({
  device,
  status,
  onCancel,
  onCodeCopied,
  onVerificationOpened,
}: {
  device: DeviceAuthState
  status: {
    attempts: number
    nextPollSeconds: number
    expiresDisplay: string
  } | null
  onCancel: () => void
  onCodeCopied: () => void
  onVerificationOpened: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyTick, setCopyTick] = useState(0)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied, copyTick])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(device.userCode)
      setCopied(true)
      // Re-arm the reset timer on a repeat click while still showing "Copied!".
      setCopyTick((t) => t + 1)
      onCodeCopied()
    } catch {
      // nothing for now
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-4 border-b border-base-200 pb-5">
        <StepNumber value={1} done={device.progress >= 1} />

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Copy the one-time code</h2>

          <div className="my-3 select-all rounded-xl border border-[#eee] bg-base-200 px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.2em]">
            {device.userCode}
          </div>

          <button
            className={[
              "btn btn-sm w-full",
              copied ? "btn-success" : "btn-outline btn-primary",
            ].join(" ")}
            onClick={copyCode}
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy code
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-base-200 pb-5">
        <StepNumber value={2} done={device.progress >= 2} />

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            Open the GitHub verification page
          </h2>

          <a
            className="btn btn-outline btn-primary btn-sm mt-3 w-full"
            href={device.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              window.setTimeout(onVerificationOpened, 0)
            }}
          >
            <ExternalLink className="size-4" />
            Open {device.verificationUri}
          </a>

          <p className="mt-2 text-xs leading-relaxed text-base-content/50">
            Paste the code there, authorize the app, then come back here.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <StepNumber value={3} done={false} />

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            Wait; we&apos;re checking automatically
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-base-content/50">
            Once you authorize on github.com, this page should detect it within
            a few seconds.
          </p>

          <p className="mt-3 font-mono text-xs text-base-content/50">
            attempt {status?.attempts ?? device.attempts} · next in{" "}
            {status?.nextPollSeconds ?? device.intervalSeconds}s · expires in{" "}
            {status?.expiresDisplay ?? "-"}
          </p>
        </div>
      </div>

      <div className="divider" />

      <button className="btn btn-outline w-full" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
