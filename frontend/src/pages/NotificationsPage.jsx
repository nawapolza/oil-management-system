import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Info, RefreshCw, ShieldAlert } from 'lucide-react'
import { api } from '../api'
import Button from '../components/Button'
import { Card } from '../components/Card'
import { dateTH } from '../utils/format'

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
  success: CheckCircle2,
}

const toneMap = {
  info: 'bg-blue-50 text-blue-700 border-blue-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  danger: 'bg-rose-50 text-rose-700 border-rose-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
}

export default function NotificationsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const res = await api.notifications()
      setRows(res.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const markRead = async (id) => {
    try {
      await api.markRead(id)
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: 1 } : r)))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">ระบบแจ้งเตือน</h1>
          <p className="mt-1 text-slate-500">ระบบสร้างแจ้งเตือนอัตโนมัติจากรายการที่ยังไม่จ่าย ไม่มีรูป หรือปริมาณสูงผิดปกติ</p>
        </div>
        <Button variant="secondary" onClick={load}><RefreshCw size={16} /> Refresh</Button>
      </div>

      {error && <div className="rounded-3xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-950 text-white"><Bell size={22} /></div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-950">รายการแจ้งเตือนล่าสุด</h2>
            <p className="text-sm text-slate-500">ทั้งหมด {rows.length} รายการ</p>
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((row) => {
            const Icon = iconMap[row.type] || Info
            return (
              <div key={row.id} className={`rounded-3xl border p-4 ${toneMap[row.type] || toneMap.info} ${Number(row.is_read) ? 'opacity-60' : ''}`}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex gap-3">
                    <div className="mt-1"><Icon size={22} /></div>
                    <div>
                      <p className="font-extrabold">{row.title}</p>
                      <p className="mt-1 text-sm opacity-90">{row.message}</p>
                      <p className="mt-2 text-xs opacity-70">{dateTH(row.created_at)} · บิล {row.bill_no || '-'}</p>
                    </div>
                  </div>
                  {!Number(row.is_read) && <Button variant="secondary" onClick={() => markRead(row.id)}>อ่านแล้ว</Button>}
                </div>
              </div>
            )
          })}
          {!rows.length && !loading && <p className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">ไม่มีแจ้งเตือน</p>}
        </div>
      </Card>
    </div>
  )
}
