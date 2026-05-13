import { Link } from '@tanstack/react-router'

const Breadcrumb = ({ className }) => (
  <div className={`[&>a]:text-[#4e80ee] ${className}`}>
    <Link to='/classes'>Classes</Link> &gt; <Link to='/assignments'>AP CS Principles</Link> &gt; Students
  </div>
)

export default Breadcrumb
