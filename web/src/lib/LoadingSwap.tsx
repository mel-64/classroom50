import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"
import { crossFade } from "./motion"

/**
 * Cross-fades a loading fallback with resolved content. While `loading` is
 * true it renders `fallback`; once false it renders `children`, and Motion
 * fades the outgoing view out as the incoming one fades in (`mode="wait"`).
 *
 * Keyed on the loading boolean so it fires once on the load->resolved
 * boundary and not on subsequent content re-renders. Honors reduced motion
 * via the app-level MotionConfig.
 */
export function LoadingSwap({
  loading,
  fallback,
  children,
  className,
}: {
  loading: boolean
  fallback: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loading ? "loading" : "loaded"}
        variants={crossFade}
        initial="initial"
        animate="animate"
        exit="exit"
        className={className}
      >
        {loading ? fallback : children}
      </motion.div>
    </AnimatePresence>
  )
}
