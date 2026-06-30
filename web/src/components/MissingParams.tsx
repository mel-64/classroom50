// Full-page bail when a route is missing an expected URL param. Shared so the
// guard markup stays consistent across pages.
export const MissingParams = ({ message }: { message: string }) => (
  <div className="alert alert-error m-10">{message}</div>
)

export default MissingParams
