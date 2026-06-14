import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CalendarDays, Download, Droplets, Fuel, Gauge, RefreshCw, Route, Truck } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import Button from '../components/Button'
import { Card, StatCard } from '../components/Card'
import { Input } from '../components/Input'
import { dateTH, monthStartISO, num, thb, todayISO } from '../utils/format'
import { exportDashboardPDF } from '../utils/pdf'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ from: monthStartISO(), to: todayISO() })
  const [lastUpdated, setLastUpdated] = useState('')

  const load = async () => {
    setError('')
    try {
      const res = await api.stats(filters)
      setStats(res)
      setLastUpdated(new Date().toLocaleTimeString('th-TH'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to])

  const summary = stats?.summary || {}
  const oilTypeRows = useMemo(() => stats?.oilTypes || [], [stats])

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Realtime refresh ทุก 3 วินาที
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
            Dashboard เจ้าของกิจการ
          </h1>
          <p className="mt-1 text-slate-500">ดูข้อมูลจากพนักงานแบบ realtime วิเคราะห์น้ำมัน ค่าแรง และทะเบียนรถ</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Input label="ตั้งแต่" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input label="ถึง" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <Button variant="secondary" onClick={load}><RefreshCw size={16} /> Refresh</Button>
          <Button onClick={() => exportDashboardPDF(stats)}><Download size={16} /> Export PDF</Button>
        </div>
      </div>

      {error && <div className="rounded-3xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="เที่ยวงานทั้งหมด" value={num(summary.total_trips, 0)} subtitle={`อัปเดตล่าสุด ${lastUpdated || '-'}`} icon={Truck} tone="slate" />
        <StatCard title="น้ำมันรวม" value={`${num(summary.total_liters)} ลิตร`} subtitle="รวมตามช่วงวันที่" icon={Droplets} tone="blue" />
        <StatCard title="จำนวนเงินรวม" value={thb(summary.total_amount)} subtitle="ยอดรวมค่าแรง/รายการ" icon={Banknote} tone="emerald" />
        <StatCard title="ราคาเฉลี่ย / ลิตร" value={thb(summary.avg_price)} subtitle="คำนวณจากยอดเงิน ÷ ลิตร" icon={Gauge} tone="violet" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="ระยะทางรวม" value={`${num(summary.total_distance)} กม.`} subtitle="จากข้อมูลที่พนักงานกรอก" icon={Route} tone="amber" />
        <StatCard title="น้ำมันรถใช้ไป" value={`${num(summary.total_fuel_used)} ลิตร`} subtitle="ใช้วิเคราะห์อัตราสิ้นเปลือง" icon={Fuel} tone="blue" />
        <StatCard title="พนักงาน active" value={`${num(summary.active_employees, 0)} คน`} subtitle="บัญชีพนักงานที่เปิดใช้งาน" icon={Truck} tone="slate" />
        <StatCard title="ทะเบียนรถ" value={`${num(summary.active_vehicles, 0)} คัน`} subtitle="รถที่พนักงานเพิ่มเอง" icon={Truck} tone="violet" />
        <StatCard title="ต้องตรวจสอบ" value={`${num(Number(summary.pending_payments || 0) + Number(summary.missing_photos || 0), 0)} รายการ`} subtitle={`รอจ่าย ${summary.pending_payments || 0}, ไม่มีรูป ${summary.missing_photos || 0}`} icon={AlertTriangle} tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">แนวโน้มลิตร/จำนวนเงินรายวัน</h2>
              <p className="text-sm text-slate-500">ดูภาพรวมการวิ่งงานในแต่ละวัน</p>
            </div>
            <CalendarDays className="text-slate-400" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.daily || []} margin={{ left: -20, right: 10 }}>
                <defs>
                  <linearGradient id="liters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.22}/>
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="work_date" tickFormatter={(v) => new Date(v).getDate()} />
                <YAxis />
                <Tooltip formatter={(value, name) => [num(value), name === 'liters' ? 'ลิตร' : 'จำนวนเงิน']} labelFormatter={dateTH} />
                <Area type="monotone" dataKey="liters" stroke="#0f172a" fill="url(#liters)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-extrabold text-slate-950">ประเภทน้ำมัน</h2>
          <p className="text-sm text-slate-500">สัดส่วนตามปริมาณลิตร</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={oilTypeRows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={4}>
                  {oilTypeRows.map((_, i) => <Cell key={i} fill={['#0f172a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'][i % 5]} />)}
                </Pie>
                <Tooltip formatter={(value) => `${num(value)} ลิตร`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {oilTypeRows.map((row, i) => (
              <div key={row.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">{i + 1}. {row.name}</span>
                <span className="text-slate-500">{num(row.value)} ลิตร</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-extrabold text-slate-950">ปลายทางยอดนิยม</h2>
          <p className="text-sm text-slate-500">เรียงตามปริมาณลิตรรวม</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.topDestinations || []} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="destination" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => `${num(value)} ลิตร`} />
                <Bar dataKey="liters" radius={[10, 10, 0, 0]} fill="#0f172a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-extrabold text-slate-950">รายการล่าสุด</h2>
          <p className="text-sm text-slate-500">ข้อมูลที่เข้ามาล่าสุดจากพนักงาน</p>
          <div className="mt-4 space-y-3">
            {(stats?.latest || []).map((row) => (
              <div key={row.id} className="rounded-3xl border border-slate-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-slate-950">{row.bill_no || `รายการ #${row.id}`} · {row.oil_type || 'ไม่ระบุ'}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.origin_place || '-'} → {row.destination_place || '-'}</p>
                    <p className="mt-1 text-xs text-slate-400">{dateTH(row.work_date)} · {row.employee_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-950">{num(row.quantity_liters)} ลิตร</p>
                    <p className="text-sm text-slate-500">{thb(row.amount_baht)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!stats?.latest?.length && !loading && <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
