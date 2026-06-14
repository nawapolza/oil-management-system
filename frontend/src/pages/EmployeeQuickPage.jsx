import { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, ClipboardList, Droplets, MapPin, Plus, RefreshCw, Save, Truck, UploadCloud } from 'lucide-react'
import { api, fileUrl } from '../api'
import Button from '../components/Button'
import { Card, StatCard } from '../components/Card'
import { Input, Textarea } from '../components/Input'
import { useAuth } from '../contexts/AuthContext'
import { dateTH, num, thb, todayISO } from '../utils/format'

const oilTypes = ['ดีเซล', 'เบนซิน', 'แก๊สโซฮอล์', 'น้ำมันเครื่อง', 'อื่นๆ']

const emptyForm = () => ({
  work_date: todayISO(),
  plate_no: localStorage.getItem('oilops_last_plate') || '',
  bill_no: '',
  origin_place: '',
  destination_place: '',
  oil_type: localStorage.getItem('oilops_last_oil') || 'ดีเซล',
  tank_weight: '',
  quantity_liters: '',
  amount_baht: '',
  distance_km: '',
  fuel_used_liters: '',
  wage_payer: '',
  payment_status: 'pending',
  note: '',
})

export default function EmployeeQuickPage() {
  const { user } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [photo, setPhoto] = useState(null)
  const [rows, setRows] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    try {
      const [deliveryRes, vehicleRes] = await Promise.all([
        api.deliveries({ limit: 8 }),
        api.vehicles(),
      ])
      setRows(deliveryRes.data || [])
      setVehicles(vehicleRes.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const summary = useMemo(() => {
    const today = todayISO()
    const todayRows = rows.filter((r) => r.work_date === today)
    return {
      trips: todayRows.length,
      liters: todayRows.reduce((sum, r) => sum + Number(r.quantity_liters || 0), 0),
      amount: todayRows.reduce((sum, r) => sum + Number(r.amount_baht || 0), 0),
    }
  }, [rows])

  const computed = useMemo(() => {
    const liters = Number(form.quantity_liters || 0)
    const amount = Number(form.amount_baht || 0)
    const distance = Number(form.distance_km || 0)
    const fuel = Number(form.fuel_used_liters || 0)
    return {
      price: liters > 0 ? amount / liters : 0,
      fuelRate: distance > 0 ? (fuel / distance) * 100 : 0,
    }
  }, [form])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const pickVehicle = (plate) => {
    update('plate_no', plate)
    localStorage.setItem('oilops_last_plate', plate)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.plate_no.trim()) {
      setError('กรุณากรอกทะเบียนรถ')
      return
    }
    if (!form.origin_place.trim() || !form.destination_place.trim()) {
      setError('กรุณากรอกต้นทางและปลายทาง')
      return
    }
    if (!form.quantity_liters) {
      setError('กรุณากรอกจำนวนลิตร')
      return
    }

    setSaving(true)
    try {
      localStorage.setItem('oilops_last_plate', form.plate_no.trim())
      localStorage.setItem('oilops_last_oil', form.oil_type)
      const res = await api.createDelivery({
        ...form,
        load_date: form.work_date,
        unload_date: form.work_date,
      })
      if (photo && res.id) {
        await api.uploadPhoto(res.id, photo)
      }
      setForm((prev) => ({ ...emptyForm(), plate_no: prev.plate_no, oil_type: prev.oil_type }))
      setPhoto(null)
      setSuccess('บันทึกสำเร็จ เจ้าของกิจการเห็นข้อมูลบน Dashboard ทันที')
      await load()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 lg:pb-0">
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-900/20 sm:p-7">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> มือถือบันทึกง่าย · ส่ง realtime ทุก 5 วินาที
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">สวัสดี {user?.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              กรอกแค่ทะเบียนรถ เส้นทาง ลิตร และเงิน ระบบจะสร้างทะเบียนให้เองและส่งให้เจ้าของดูทันที
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={load} className="border-white/10 bg-white/10 text-white hover:bg-white/20">
            <RefreshCw size={16} /> อัปเดต
          </Button>
        </div>
      </section>

      {error && <div className="rounded-3xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}
      {success && <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="งานวันนี้" value={`${num(summary.trips, 0)} เที่ยว`} subtitle="เฉพาะรายการของฉัน" icon={ClipboardList} tone="slate" />
        <StatCard title="ลิตรรวมวันนี้" value={`${num(summary.liters)} ลิตร`} subtitle="รวมจากที่กรอกวันนี้" icon={Droplets} tone="blue" />
        <StatCard title="เงินรวมวันนี้" value={thb(summary.amount)} subtitle="เจ้าของเห็นทันที" icon={CheckCircle2} tone="emerald" />
      </div>

      <Card className="border-2 border-slate-950/5">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-950 text-white"><Plus size={22} /></div>
          <div>
            <h2 className="text-xl font-black text-slate-950">เพิ่มงานน้ำมัน</h2>
            <p className="text-sm text-slate-500">ออกแบบให้กดน้อย ใช้บนมือถือได้ง่าย</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-[1.7rem] bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Truck size={18} /> 1. ทะเบียนรถของฉัน</div>
            <Input
              label="ทะเบียนรถ"
              value={form.plate_no}
              onChange={(e) => pickVehicle(e.target.value)}
              placeholder="เช่น 70-2791"
              autoComplete="off"
              required
              className="text-base font-bold"
            />
            {vehicles.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {vehicles.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => pickVehicle(v.plate_no)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${form.plate_no === v.plate_no ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 shadow-sm'}`}
                  >
                    {v.plate_no}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.7rem] bg-sky-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><MapPin size={18} /> 2. เส้นทาง</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="วันที่" type="date" value={form.work_date} onChange={(e) => update('work_date', e.target.value)} required />
              <Input label="ต้นทาง" value={form.origin_place} onChange={(e) => update('origin_place', e.target.value)} placeholder="สถานที่บรรทุก" required />
              <Input label="ปลายทาง" value={form.destination_place} onChange={(e) => update('destination_place', e.target.value)} placeholder="สถานที่ลง" required />
            </div>
          </div>

          <div className="rounded-[1.7rem] bg-emerald-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Droplets size={18} /> 3. ข้อมูลน้ำมัน</div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {oilTypes.map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => update('oil_type', type)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${form.oil_type === type ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 shadow-sm'}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="จำนวนลิตร" type="number" inputMode="decimal" step="0.01" value={form.quantity_liters} onChange={(e) => update('quantity_liters', e.target.value)} placeholder="169.54" required />
              <Input label="จำนวนเงิน/ค่าแรง" type="number" inputMode="decimal" step="0.01" value={form.amount_baht} onChange={(e) => update('amount_baht', e.target.value)} placeholder="7000" />
              <Input label="น้ำหนักบรรทุก" type="number" inputMode="decimal" step="0.001" value={form.tank_weight} onChange={(e) => update('tank_weight', e.target.value)} placeholder="30.290" />
              <Input label="เลขบิล/เลขงาน" value={form.bill_no} onChange={(e) => update('bill_no', e.target.value)} placeholder="ถ้ามี" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Input label="ระยะทาง กม." type="number" inputMode="decimal" step="0.01" value={form.distance_km} onChange={(e) => update('distance_km', e.target.value)} />
              <Input label="น้ำมันรถใช้ไป" type="number" inputMode="decimal" step="0.01" value={form.fuel_used_liters} onChange={(e) => update('fuel_used_liters', e.target.value)} />
              <Input label="ผู้จ่ายค่าแรง" value={form.wage_payer} onChange={(e) => update('wage_payer', e.target.value)} placeholder="เช่น บริษัทคู่ค้า" />
            </div>
            <div className="mt-3 rounded-3xl bg-white p-4 text-sm text-slate-600 shadow-sm">
              ราคาเฉลี่ย <b className="text-slate-950">{thb(computed.price)} / ลิตร</b>
              <span className="mx-2 text-slate-300">|</span>
              อัตราสิ้นเปลือง <b className="text-slate-950">{num(computed.fuelRate)} ลิตร/100กม.</b>
            </div>
          </div>

          <div className="rounded-[1.7rem] bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Camera size={18} /> 4. แนบรูปบิล/เอกสาร</div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-amber-200 bg-white p-5 text-center transition hover:border-amber-400">
              <UploadCloud className="text-amber-500" />
              <span className="mt-2 text-sm font-bold text-slate-700">{photo ? photo.name : 'กดเพื่อถ่ายรูปหรือเลือกรูปจากมือถือ'}</span>
              <span className="mt-1 text-xs text-slate-400">รองรับ JPG, PNG, WEBP</span>
              <input className="hidden" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
            <Textarea className="mt-3" label="หมายเหตุ" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="เช่น รายละเอียดเพิ่มเติม" />
          </div>

          <Button disabled={saving} className="sticky bottom-20 z-20 w-full py-4 text-base shadow-2xl lg:static">
            <Save size={19} /> {saving ? 'กำลังบันทึก...' : 'บันทึกงาน ส่งให้เจ้าของทันที'}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">รายการล่าสุดของฉัน</h2>
            <p className="text-sm text-slate-500">อัปเดตอัตโนมัติ เจ้าของเห็นข้อมูลชุดเดียวกัน</p>
          </div>
          {loading && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{row.plate_no || form.plate_no || '-'} · {row.oil_type || '-'}</p>
                  <p className="mt-1 text-sm text-slate-500">{row.origin_place || '-'} → {row.destination_place || '-'}</p>
                  <p className="mt-1 text-xs text-slate-400">{dateTH(row.work_date)} · {row.bill_no || `#${row.id}`}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-950">{num(row.quantity_liters)} ลิตร</p>
                  <p className="text-sm text-slate-500">{thb(row.amount_baht)}</p>
                </div>
              </div>
              {row.receipt_photo && <img src={fileUrl(row.receipt_photo)} alt="receipt" className="mt-3 h-28 w-full rounded-2xl object-cover" />}
            </div>
          ))}
          {!rows.length && !loading && <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-500 md:col-span-2">ยังไม่มีรายการ</p>}
        </div>
      </Card>
    </div>
  )
}
