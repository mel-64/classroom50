import { useEffect } from "react"

const BASE_TITLE = "Classroom 50"

/**
 * Sets `document.title` for the current page and restores the base title on
 * unmount. Client-only SPA, so we manage the title imperatively rather than via
 * a server-rendered <head>. Pass the page-specific part; the base app name is
 * appended automatically (e.g. "Assignments · Classroom 50").
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = BASE_TITLE
    }
  }, [title])
}

export default useDocumentTitle
