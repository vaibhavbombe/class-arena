import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ThemeToggle from './components/ThemeToggle.jsx'
import { watchOtherTabs } from './session.js'
import AcceptInvite from './pages/AcceptInvite.jsx'
import ClassAnalytics from './pages/ClassAnalytics.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import LiveQuizEditor from './pages/LiveQuizEditor.jsx'
import HostGame from './pages/HostGame.jsx'
import Login from './pages/Login.jsx'
import PlayGame from './pages/PlayGame.jsx'
import QuestionBank from './pages/QuestionBank.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Signup from './pages/Signup.jsx'
import StudentSignup from './pages/StudentSignup.jsx'
import TestPage from './pages/TestPage.jsx'
import TestResults from './pages/TestResults.jsx'

// Pages without the app header still get a theme switch (the header has its own).
const PUBLIC_PAGES = ['/login', '/signup', '/join', '/accept-invite', '/forgot-password', '/reset-password']
function PublicThemeToggle() {
  const { pathname } = useLocation()
  return PUBLIC_PAGES.includes(pathname) ? <ThemeToggle /> : null
}

export default function App() {
  useEffect(watchOtherTabs, [])

  return (
    <BrowserRouter>
      <PublicThemeToggle />
      <Routes>
        <Route path="/" element={<Navigate to={localStorage.getItem('accessToken') ? '/dashboard' : '/login'} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join" element={<StudentSignup />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="/classes/:id/analytics" element={<ClassAnalytics />} />
        <Route path="/questions" element={<QuestionBank />} />
        <Route path="/tests/:id" element={<TestPage />} />
        <Route path="/tests/:id/results" element={<TestResults />} />
        <Route path="/live-quizzes/:id" element={<LiveQuizEditor />} />
        <Route path="/live-games/:id/host" element={<HostGame />} />
        <Route path="/play" element={<PlayGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
