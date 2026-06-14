import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Truck, UserRound } from 'lucide-react'
import { api } from '../api'
import Button from '../components/Button'
import { Card } from '../components/Card'
import { Input, Select, Textarea } from '../components/Input'

export default function VehiclesPage() {
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ user_id: '', plate_no: '', vehicle_no: '', driver_name: '', description: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    setError('')
    try {
      const [vehicleRes, userRes] = await Promise.all([api.vehicles(), api.users()])
      setRows(vehicleRes.data || [])
      setUsers((userRes.data || []).filter((u) => u.role === 'employee' && Number(u.is_active) === 1))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await api.createVehicle(form)
      setForm({ user_id: '', plate_no: '', vehicle_no: '', driver_name: '', description: '' })
      setSuccess('เพิ่มทะเบียนรถสำเร็จ')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Realtime ทะเบียนรถจากพนักงาน
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">ทะเบียนรถ</h1>
          <p className="mt-1 text-slate-500">พนักงานกรอกทะเบียนเองได้จากมือถือ เจ้าของเห็นในหน้านี้ทันที</p>
        </div>
        <Button variant="secondary" onClick={load}><RefreshCw size={16} /> Refresh</Button>
      </div>

      {error && <div className="rounded-3xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}
      {success && <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-950 text-white"><Plus size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-950">เพิ่มทะเบียนให้พนักงาน</h2>
              <p className="text-sm text-slate-500">ใช้กรณีเจ้าของต้องการเพิ่มเอง</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Select label="เลือกพนักงาน" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">ไม่ระบุ / รถส่วนกลาง</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
            </Select>
            <Input label="ทะเบียนรถ" value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} placeholder="70-2791" required />
            <Input label="รหัสรถ/ชื่อรถ" value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} placeholder="รถบรรทุก 1" />
            <Input label="คนขับ" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="ถ้าไม่กรอก ระบบใช้ชื่อพนักงานตอนบันทึก" />
            <Textarea label="รายละเอียด" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button className="w-full py-3">บันทึกทะเบียน</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-100 text-slate-950"><Truck size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-950">รถทั้งหมด</h2>
              <p className="text-sm text-slate-500">ทั้งหมด {rows.length} ทะเบียน</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black text-slate-950">{row.plate_no}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.vehicle_no || 'ไม่ระบุรหัสรถ'}</p>
                  </div>
                  <Truck className="text-slate-300" />
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
                  <p className="flex items-center gap-2 font-bold text-slate-700"><UserRound size={15} /> {row.employee_name || row.driver_name || 'รถส่วนกลาง'}</p>
                  <p className="mt-1 text-slate-500">ใช้งานแล้ว {Number(row.total_trips || 0)} เที่ยว</p>
                </div>
                <p className="mt-3 text-sm text-slate-400">{row.description || '-'}</p>
              </div>
            ))}
            {!rows.length && <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">ยังไม่มีทะเบียนรถ</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
