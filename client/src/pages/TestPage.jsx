import useMe from '../useMe.js'
import TakeTest from './TakeTest.jsx'
import TestEditor from './TestEditor.jsx'

// /tests/:id: staff edit the test, students take it.
export default function TestPage() {
  const me = useMe()
  if (!me) return null
  return me.user.role === 'student' ? <TakeTest me={me} /> : <TestEditor />
}
