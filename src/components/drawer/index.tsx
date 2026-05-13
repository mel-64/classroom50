const Drawer = ({ children }) => <div className="drawer lg:drawer-open">{children}</div>

export const DrawerContent = ({ children, className }) => <div className={`${className} drawer-content`}>{children}</div>
export const DrawerToggle = () => <div className="drawer-toggle"></div>

export default Drawer
