import { useParams } from "@tanstack/react-router"
import { useEffect } from "react"

import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"

const OrgPage = () => {
  const params = useParams({ from: "/$org/" })
  const { teacherRepo, isTeacher, isStudent, isBlocked } =
    useCourseTeacherAccess(params.org)

  useEffect(() => {
    console.log("teacher repo", teacherRepo)
    console.log("isTeacher", isTeacher)
    console.log("isStudent", isStudent)
    console.log("isBlocked", isBlocked)
  }, [teacherRepo, isTeacher, isStudent, isBlocked])

  return (
    <div>
      <div>Is student: {String(isStudent)}</div>
      <div>Is teacher: {String(isTeacher)}</div>
      <div>Is blocked: {String(isBlocked)}</div>
    </div>
  )
}

export default OrgPage
