export type Classroom = {
  path: string
  active: boolean
  term: string
  name: string
  short_name: string
  org: string
}

export type Assignment = {
  slug: string
  name: string
  description: string
  template: {
    owner: string
    repo: string
    branch: string
  }
  mode: string
  autograder: string
  runtime: {
    container: {
      image: string
      user: string
    }
  }
}

export type AssignmentTest = {
  name: string
  input: string
  output: string
  points: number
}
