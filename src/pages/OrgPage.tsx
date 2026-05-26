import { useParams } from "@tanstack/react-router"
import { useEffect } from "react"

import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetClasses from "@/hooks/useGetClasses"

const OrgPage = () => {
  const params = useParams({ from: "/$org/" })
  const { teacherRepo, isTeacher, isStudent, isBlocked } =
    useCourseTeacherAccess(params.org)
  const { data: classesData } = useGetClasses(params.org)

  // useEffect(() => {
  //   console.log("teacher repo", teacherRepo)
  //   console.log("isTeacher", isTeacher)
  //   console.log("isStudent", isStudent)
  //   console.log("isBlocked", isBlocked)
  // }, [teacherRepo, isTeacher, isStudent, isBlocked])
  //
  // useEffect(() => {
  //   console.log("classes data", classesData)
  //   console.log("typeof classesData", typeof classesData)
  // }, [classesData])

  return (
    <div>
      <div>Is student: {String(isStudent)}</div>
      <div>Is teacher: {String(isTeacher)}</div>
      <div>Is blocked: {String(isBlocked)}</div>
      <hr />

      <div>
        <h3>Classes</h3>
        <ul>
          {classesData
            ?.filter?.((cl) => cl.type === "dir" && cl.name !== ".github")
            .map((cl) => (
              <li>{cl.name}</li>
            ))}
        </ul>
      </div>
    </div>
  )
}

export default OrgPage
