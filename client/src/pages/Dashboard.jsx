import { useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import ClassesPanel from '../components/ClassesPanel.jsx'
import MembersPanel from '../components/MembersPanel.jsx'
import RolesPanel from '../components/RolesPanel.jsx'
import { can } from '../permissions.js'
import useMe from '../useMe.js'
import { colors, widePageStyle } from '../styles.js'

const GREETING = {
  admin: 'Manage your classes, teachers and students.',
  teacher: 'Create classes, build tests and run live quizzes.',
  student: 'Your classes, tests and live games are all here.',
}

export default function Dashboard() {
  const me = useMe()
  const [rolesVersion, setRolesVersion] = useState(0) // lets the members list pick up role changes
  if (!me) return null
  const firstName = me.user.name.split(' ')[0]

  return (
    <div style={widePageStyle}>
      <AppHeader me={me} />
      <h1 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.7rem' }}>Hi {firstName} 👋</h1>
      <p style={{ color: colors.muted, fontWeight: 600, margin: 0 }}>
        {GREETING[me.user.role]}
        {me.roleName && me.roleName !== me.user.role ? ` You're signed in as ${me.roleName}.` : ''}
      </p>
      <ClassesPanel me={me} />
      {can(me, 'members.view') && <MembersPanel me={me} rolesVersion={rolesVersion} />}
      {can(me, 'roles.manage') && <RolesPanel onChanged={() => setRolesVersion((v) => v + 1)} />}
    </div>
  )
}
