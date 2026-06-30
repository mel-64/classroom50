import { describe, expect, it } from "vitest"
import { groupStudentsBySection } from "./EnrolledStudents"
import type { Student } from "@/types/classroom"

const student = (username: string, section?: string): Student =>
  ({ username, section }) as Student

describe("groupStudentsBySection (#218)", () => {
  it("groups by trimmed section name", () => {
    const groups = groupStudentsBySection([
      student("a", "Period 1"),
      student("b", "Period 2"),
      student("c", " Period 1 "),
    ])
    expect(groups.map((g) => g.section)).toEqual(["Period 1", "Period 2"])
    expect(groups[0].students.map((s) => s.username)).toEqual(["a", "c"])
  })

  it("sorts sections numerically/locale-aware", () => {
    const groups = groupStudentsBySection([
      student("a", "Section 10"),
      student("b", "Section 2"),
    ])
    expect(groups.map((g) => g.section)).toEqual(["Section 2", "Section 10"])
  })

  it("folds blank/absent sections into a 'No section' bucket placed last", () => {
    const groups = groupStudentsBySection([
      student("a", ""),
      student("b", "Period 1"),
      student("c"),
    ])
    expect(groups.map((g) => g.section)).toEqual(["Period 1", "No section"])
    expect(groups[1].students.map((s) => s.username)).toEqual(["a", "c"])
  })

  it("returns an empty array for no students", () => {
    expect(groupStudentsBySection([])).toEqual([])
  })
})
