import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { watchOtherTabs } from './session.js'
import AcceptInvite from './pages/AcceptInvite.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import StudentSignup from './pages/StudentSignup.jsx'

export default function App() {
  useEffect(watchOtherTabs, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={localStorage.getItem('accessToken') ? '/dashboard' : '/login'} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join" element={<StudentSignup />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
