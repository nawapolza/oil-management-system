import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Loading from './components/Loading'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DeliveriesPage from './pages/DeliveriesPage'
import EmployeeQuickPage from './pages/EmployeeQuickPage'
import NotificationsPage from './pages/NotificationsPage'
import UsersPage from './pages/UsersPage'
import VehiclesPage from './pages/VehiclesPage'

function Router() {
  const { user, loading, isOwner } = useAuth()
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    if (!user) return
    setPage(isOwner ? 'dashboard' : 'quick')
  }, [user?.id, isOwner])

  if (loading) return <Loading />
  if (!user) return <LoginPage />

  const pages = {
    dashboard: isOwner ? <DashboardPage /> : <EmployeeQuickPage />,
    quick: <EmployeeQuickPage />,
    deliveries: isOwner ? <DeliveriesPage /> : <EmployeeQuickPage />,
    notifications: <NotificationsPage />,
    users: isOwner ? <UsersPage /> : <EmployeeQuickPage />,
    vehicles: isOwner ? <VehiclesPage /> : <EmployeeQuickPage />,
  }

  return (
    <Layout page={page} setPage={setPage}>
      {pages[page] || (isOwner ? <DashboardPage /> : <EmployeeQuickPage />)}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  )
}
