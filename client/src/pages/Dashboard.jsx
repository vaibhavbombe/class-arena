import AppHeader from '../components/AppHeader.jsx'
import ClassesPanel from '../components/ClassesPanel.jsx'
import MembersPanel from '../components/MembersPanel.jsx'
import useMe from '../useMe.js'
import { widePageStyle } from '../styles.js'

export default function Dashboard() {
  const me = useMe()
  if (!me) return null

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <ClassesPanel role={me.user.role} />
      {me.user.role === 'admin' && <MembersPanel />}
    </div>
  )
}
