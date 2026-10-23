import { Route, Routes, useLocation } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Marketplace from './pages/Marketplace'
import Impact from './pages/Impact'
import { DashboardRedirect } from './pages/Dashboard'
import DonorDashboard from './pages/DonorDashboard'
import NgoDashboard from './pages/NgoDashboard'
import VolunteerDashboard from './pages/VolunteerDashboard'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  const { pathname } = useLocation()
  const tinted = pathname.startsWith('/dashboard') || pathname === '/find' || pathname === '/impact'
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className={`flex-1 ${tinted ? 'bg-cream-50' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/find" element={<Marketplace />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />
          <Route path="/dashboard/donor" element={<ProtectedRoute roles={['donor']}><DonorDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/ngo" element={<ProtectedRoute roles={['ngo']}><NgoDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/volunteer" element={<ProtectedRoute roles={['volunteer']}><VolunteerDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<p className="p-16 text-center">Page not found.</p>} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
