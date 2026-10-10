import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { watchOtherTabs } from './session.js'
import AcceptInvite from './pages/AcceptInvite.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import LiveQuizEditor from './pages/LiveQuizEditor.jsx'
import Login from './pages/Login.jsx'
import QuestionBank from './pages/QuestionBank.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Signup from './pages/Signup.jsx'
import StudentSignup from './pages/StudentSignup.jsx'
import TestPage from './pages/TestPage.jsx'
import TestResults from './pages/TestResults.jsx'

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
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="/questions" element={<QuestionBank />} />
        <Route path="/tests/:id" element={<TestPage />} />
        <Route path="/tests/:id/results" element={<TestResults />} />
        <Route path="/live-quizzes/:id" element={<LiveQuizEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
