import { Bell, Gauge, LogOut, Menu, Users, X, ClipboardList, Truck, FileText, PlusCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const ownerNav = [
  { key: 'dashboard', label: 'Dashboard', short: 'สรุป', icon: Gauge },
  { key: 'deliveries', label: 'รายการน้ำมัน', short: 'รายการ', icon: ClipboardList },
  { key: 'vehicles', label: 'ทะเบียนรถ', short: 'รถ', icon: Truck },
  { key: 'users', label: 'พนักงาน', short: 'คน', icon: Users },
  { key: 'notifications', label: 'แจ้งเตือน', short: 'เตือน', icon: Bell },
]

const employeeNav = [
  { key: 'quick', label: 'บันทึกงาน', short: 'บันทึก', icon: PlusCircle },
  { key: 'notifications', label: 'แจ้งเตือน', short: 'เตือน', icon: Bell },
]

export default function Layout({ page, setPage, children }) {
  const { user, logout, isOwner } = useAuth()
  const [open, setOpen] = useState(false)
  const navItems = useMemo(() => (isOwner ? ownerNav : employeeNav), [isOwner])

  const go = (key) => {
    setPage(key)
    setOpen(false)
  }

  const Nav = ({ compact = false }) => (
    <nav className={compact ? 'grid grid-cols-2 gap-2' : 'mt-6 space-y-1'}>
      {navItems.map((item) => {
        const Icon = item.icon
        const active = page === item.key || (!isOwner && page === 'dashboard' && item.key === 'quick')
        return (
          <button
            key={item.key}
            onClick={() => go(item.key)}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${active ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/15' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'} ${compact ? 'justify-center' : ''}`}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_30%),radial-gradient(circle_at_top_right,#ccfbf1,transparent_30%),#f8fafc]">
      <aside className="fixed left-0 top-0 hidden h-full w-72 border-r border-white/70 bg-white/80 p-5 backdrop-blur-2xl lg:block">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-950 text-white shadow-lg">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-950">Sarawut Oil Management</h1>
            <p className="text-xs text-slate-500">Mobile Oil Realtime</p>
          </div>
        </div>
        <Nav />
        <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-slate-950 p-4 text-white">
          <p className="text-xs text-slate-300">เข้าสู่ระบบเป็น</p>
          <p className="mt-1 font-bold">{user?.name}</p>
          <p className="text-xs text-slate-300">{isOwner ? 'เจ้าของกิจการ' : 'พนักงาน'}</p>
          <button onClick={logout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <button onClick={() => setOpen(true)} className="rounded-2xl bg-slate-100 p-2"><Menu /></button>
          <div className="text-center">
            <p className="text-sm font-black text-slate-950">OilOps</p>
            <p className="text-xs text-slate-500">{isOwner ? 'เจ้าของกิจการ' : 'พนักงานบันทึกงาน'}</p>
          </div>
          <button onClick={logout} className="rounded-2xl bg-slate-950 p-2 text-white"><LogOut size={20} /></button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-slate-950/45 p-4 lg:hidden">
          <div className="h-full w-80 max-w-full rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-950">เมนู</h2>
                <p className="text-xs text-slate-500">{user?.name}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-2xl bg-slate-100 p-2"><X /></button>
            </div>
            <Nav />
          </div>
        </div>
      )}

      <main className="p-4 pb-28 lg:ml-72 lg:p-8">
        {children}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur lg:hidden">
        <div className={`grid gap-2 ${navItems.length <= 2 ? 'grid-cols-2' : 'grid-cols-5'}`}>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = page === item.key || (!isOwner && page === 'dashboard' && item.key === 'quick')
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-black transition ${active ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
              >
                <Icon size={19} />
                <span className="mt-1">{item.short}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
