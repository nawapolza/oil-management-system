import { useEffect, useMemo, useState } from 'react'
import { Camera, Download, Image as ImageIcon, Plus, Search, Trash2, UploadCloud } from 'lucide-react'
import { api, fileUrl } from '../api'
import Button from '../components/Button'
import { Card } from '../components/Card'
import { Input, Select, Textarea } from '../components/Input'
import { dateTH, num, thb, todayISO } from '../utils/format'
import { exportDeliveriesPDF } from '../utils/pdf'
import { useAuth } from '../contexts/AuthContext'

const initialForm = {
  work_date: todayISO(),
  vehicle_id: '',
  bill_no: '',
  origin_place: '',
  load_date: todayISO(),
  oil_type: 'ดีเซล',
  unload_date: todayISO(),
  destination_place: '',
  tank_weight: '',
  quantity_liters: '',
  amount_baht: '',
  distance_km: '',
  fuel_used_liters: '',
  wage_payer: '',
  payment_status: 'pending',
  note: '',
}

export default function DeliveriesPage() {
  const { isOwner } = useAuth()
  const [rows, setRows] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(initialForm)
  const [filters, setFilters] = useState({ q: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadingId, setUploadingId] = useState(null)

  const load = async () => {
    setError('')
    try {
      const [deliveryRes, vehicleRes] = await Promise.all([
        api.deliveries({ ...filters, limit: 200 }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await api.createDelivery(form)
      setForm(initialForm)
      setSuccess('บันทึกรายการสำเร็จ')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const upload = async (id, file) => {
    if (!file) return
    setError('')
    setUploadingId(id)
    try {
      await api.uploadPhoto(id, file)
      await load()
      setSuccess('อัปโหลดรูปสำเร็จ')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingId(null)
    }
  }

  const remove = async (id) => {
    if (!confirm('ยืนยันลบรายการนี้?')) return
    setError('')
    try {
      await api.deleteDelivery(id)
      await load()
      setSuccess('ลบรายการสำเร็จ')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">รายการงานน้ำมัน</h1>
          <p className="mt-1 text-slate-500">เจ้าของดูรายการจากพนักงานทุกคนแบบ realtime และ export เป็น PDF ได้</p>
        </div>
        <Button onClick={() => exportDeliveriesPDF(rows)}><Download size={16} /> Export PDF</Button>
      </div>

      {error && <div className="rounded-3xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {success && <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-slate-950 text-white"><Plus size={22} /></div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">เพิ่มรายการใหม่</h2>
              <p className="text-sm text-slate-500">เจ้าของเพิ่มรายการแทนพนักงานได้</p>
            </div>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="วันที่ปฏิบัติงาน" type="date" value={form.work_date} onChange={(e) => update('work_date', e.target.value)} required />
              <Select label="ทะเบียนรถ" value={form.vehicle_id} onChange={(e) => update('vehicle_id', e.target.value)}>
                <option value="">เลือกทะเบียนรถ</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_no} {v.vehicle_no ? `(${v.vehicle_no})` : ''}</option>)}
              </Select>
              <Input label="เลขที่บิล/เลขงาน" value={form.bill_no} onChange={(e) => update('bill_no', e.target.value)} placeholder="เช่น B001" />
              <Input label="สถานที่บรรทุก" value={form.origin_place} onChange={(e) => update('origin_place', e.target.value)} placeholder="เช่น กรุงเทพฯ" />
              <Input label="วันที่ขึ้นของ" type="date" value={form.load_date} onChange={(e) => update('load_date', e.target.value)} />
              <Select label="ประเภทน้ำมัน" value={form.oil_type} onChange={(e) => update('oil_type', e.target.value)}>
                <option>ดีเซล</option>
                <option>เบนซิน</option>
                <option>แก๊สโซฮอล์</option>
                <option>น้ำมันเครื่อง</option>
                <option>อื่นๆ</option>
              </Select>
              <Input label="วันที่ลงของ" type="date" value={form.unload_date} onChange={(e) => update('unload_date', e.target.value)} />
              <Input label="สถานที่ลง" value={form.destination_place} onChange={(e) => update('destination_place', e.target.value)} placeholder="เช่น เชียงใหม่" />
              <Input label="น้ำหนักบรรทุก" type="number" step="0.001" value={form.tank_weight} onChange={(e) => update('tank_weight', e.target.value)} placeholder="30.290" />
              <Input label="จำนวนลิตร" type="number" step="0.01" value={form.quantity_liters} onChange={(e) => update('quantity_liters', e.target.value)} placeholder="169.54" />
              <Input label="จำนวนเงิน/ค่าแรง" type="number" step="0.01" value={form.amount_baht} onChange={(e) => update('amount_baht', e.target.value)} placeholder="7000" />
              <Input label="ผู้จ่ายค่าแรง" value={form.wage_payer} onChange={(e) => update('wage_payer', e.target.value)} placeholder="เช่น บริษัทคู่ค้า" />
              <Input label="ระยะทาง กม. (วิเคราะห์)" type="number" step="0.01" value={form.distance_km} onChange={(e) => update('distance_km', e.target.value)} />
              <Input label="น้ำมันรถใช้ไป ลิตร" type="number" step="0.01" value={form.fuel_used_liters} onChange={(e) => update('fuel_used_liters', e.target.value)} />
              <Select label="สถานะค่าแรง" value={form.payment_status} onChange={(e) => update('payment_status', e.target.value)}>
                <option value="pending">รอจ่าย</option>
                <option value="paid">จ่ายแล้ว</option>
              </Select>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-700">ผลคำนวณอัตโนมัติ</p>
                <p className="mt-2 text-sm text-slate-500">ราคาเฉลี่ย: <b className="text-slate-950">{thb(computed.price)} / ลิตร</b></p>
                <p className="text-sm text-slate-500">อัตราสิ้นเปลือง: <b className="text-slate-950">{num(computed.fuelRate)} ลิตร/100กม.</b></p>
              </div>
            </div>
            <Textarea label="หมายเหตุ" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="รายละเอียดเพิ่มเติม" />
            <Button disabled={saving} className="w-full py-3">{saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'}</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">ประวัติรายการ</h2>
              <p className="text-sm text-slate-500">{isOwner ? 'เจ้าของเห็นข้อมูลทุกคน' : 'พนักงานเห็นเฉพาะรายการตัวเอง'}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input label="ค้นหา" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="บิล/ปลายทาง" />
              <Input label="จาก" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              <Input label="ถึง" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              <Button variant="secondary" className="mt-6" onClick={load}><Search size={16} /> ค้นหา</Button>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{row.plate_no || '-'} · {row.oil_type || '-'}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.origin_place || '-'} → {row.destination_place || '-'}</p>
                    <p className="mt-1 text-xs text-slate-400">{dateTH(row.work_date)} · {row.employee_name || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-950">{num(row.quantity_liters)} ลิตร</p>
                    <p className="text-sm text-slate-500">{thb(row.amount_baht)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {row.payment_status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}
                  </span>
                  <div className="flex items-center gap-2">
                    {row.receipt_photo ? (
                      <a className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700" href={fileUrl(row.receipt_photo)} target="_blank" rel="noreferrer">ดูรูป</a>
                    ) : (
                      <label className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        แนบรูป
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(row.id, e.target.files?.[0])} />
                      </label>
                    )}
                    <button onClick={() => remove(row.id)} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">ลบ</button>
                  </div>
                </div>
              </div>
            ))}
            {!rows.length && !loading && <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>}
          </div>

          <div className="hidden overflow-x-auto rounded-3xl border border-slate-100 lg:block">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-950 text-white">
                <tr>
                  <th className="p-3">วันที่</th>
                  <th className="p-3">บิล</th>
                  <th className="p-3">พนักงาน</th>
                  <th className="p-3">ทะเบียน</th>
                  <th className="p-3">เส้นทาง</th>
                  <th className="p-3">ประเภท</th>
                  <th className="p-3 text-right">ลิตร</th>
                  <th className="p-3 text-right">เงิน</th>
                  <th className="p-3">สถานะ</th>
                  <th className="p-3">รูป</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap">{dateTH(row.work_date)}</td>
                    <td className="p-3 font-bold text-slate-950">{row.bill_no || '-'}</td>
                    <td className="p-3">{row.employee_name || '-'}</td>
                    <td className="p-3">{row.plate_no || '-'}</td>
                    <td className="p-3 min-w-56">
                      <p className="font-semibold text-slate-800">{row.origin_place || '-'}</p>
                      <p className="text-xs text-slate-500">→ {row.destination_place || '-'}</p>
                    </td>
                    <td className="p-3">{row.oil_type || '-'}</td>
                    <td className="p-3 text-right font-semibold">{num(row.quantity_liters)}</td>
                    <td className="p-3 text-right font-semibold">{thb(row.amount_baht)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {row.payment_status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}
                      </span>
                    </td>
                    <td className="p-3">
                      {row.receipt_photo ? (
                        <a className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700" href={fileUrl(row.receipt_photo)} target="_blank" rel="noreferrer">
                          <ImageIcon size={14} /> ดูรูป
                        </a>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">
                          {uploadingId === row.id ? <UploadCloud size={14} className="animate-pulse" /> : <Camera size={14} />}
                          แนบรูป
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(row.id, e.target.files?.[0])} />
                        </label>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => remove(row.id)} className="rounded-2xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td className="p-8 text-center text-slate-500" colSpan="11">ยังไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
