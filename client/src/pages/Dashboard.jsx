import AppHeader from '../components/AppHeader.jsx'
import ClassesPanel from '../components/ClassesPanel.jsx'
import MembersPanel from '../components/MembersPanel.jsx'
import useMe from '../useMe.js'
import { colors, widePageStyle } from '../styles.js'

const GREETING = {
  admin: 'Manage your classes, teachers and students.',
  teacher: 'Create classes, build tests and run live quizzes.',
  student: 'Your classes, tests and live games are all here.',
}

export default function Dashboard() {
  const me = useMe()
  if (!me) return null
  const firstName = me.user.name.split(' ')[0]

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <h1 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.7rem' }}>Hi {firstName} 👋</h1>
      <p style={{ color: colors.muted, fontWeight: 600, margin: 0 }}>{GREETING[me.user.role]}</p>
      <ClassesPanel role={me.user.role} />
      {me.user.role === 'admin' && <MembersPanel currentUserId={me.user.id} />}
    </div>
  )
}
