import { Trash } from "lucide-react"

const AutogradingTestsPane = () => {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <div className="flex justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold">Autograding Tests</h3>
            <h3 className="text-md">3 tests • 30 total points</h3>
          </div>
          <div>
            <button className="btn btn-primary btn-outline">+ Add Test</button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Test Name / Command</th>
              <th>Expected Output</th>
              <th>Points</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div>
                  <h3 className="font-bold">Test 1</h3>
                  <p>
                    <pre>python main.py</pre>
                  </p>
                </div>
              </td>
              <td>
                <pre>Hello, world!</pre>
              </td>
              <td>
                <span className="badge badge-primary badge-soft">
                  10 Points
                </span>
              </td>
              <td>
                <Trash color="red" />
              </td>
            </tr>
            <tr>
              <td>
                <div>
                  <h3 className="font-bold">Test 2</h3>
                  <p>
                    <pre>python main.py loop</pre>
                  </p>
                </div>
              </td>
              <td>
                <pre>1 2 3 4 5 6 7 8 9 10</pre>
              </td>
              <td>
                <span className="badge badge-primary badge-soft">
                  10 Points
                </span>
              </td>
              <td>
                <Trash color="red" />
              </td>
            </tr>
            <tr>
              <td>
                <div>
                  <h3 className="font-bold">Test 3</h3>
                  <p>
                    <pre>python main.py even</pre>
                  </p>
                </div>
              </td>
              <td>
                <pre>2 4 6 8 10 12 14 16 18 20</pre>
              </td>
              <td>
                <span className="badge badge-primary badge-soft">
                  10 Points
                </span>
              </td>
              <td>
                <Trash color="red" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AutogradingTestsPane
