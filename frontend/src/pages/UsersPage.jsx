import { useEffect, useState } from 'react'
import { Plus, Power, RefreshCw, Users, X } from 'lucide-react'
import { api } from '../api'
import Button from '../components/Button'
import { Input, Select } from '../components/Input'

const initialForm = {
  name: '',
  username: '',
  password: 'password123',
  role: 'employee',
  phone: '',
}

function SoftCard({ children, className = '' }) {
  return (
    <section
      className={[
        'w-full max-w-full overflow-hidden bg-white shadow-sm ring-1 ring-slate-100',
        'rounded-2xl p-4',
        'sm:rounded-[1.75rem] sm:p-5',
        'lg:rounded-[2rem] lg:p-6',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}

export default function UsersPage() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(initialForm)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(true)

  const load = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await api.users()
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

  const update = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const submit = async (e) => {
    e.preventDefault()

    setError('')
    setSuccess('')
    setSaving(true)

    try {
      await api.createUser(form)
      setForm(initialForm)
      setSuccess('เพิ่มผู้ใช้สำเร็จ')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (id) => {
    setError('')
    setSuccess('')

    try {
      await api.toggleUser(id)
      setSuccess('อัปเดตสถานะผู้ใช้สำเร็จ')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-0 pb-24 sm:px-2 lg:px-0 lg:pb-6">
      <div className="space-y-4 sm:space-y-5 lg:space-y-6">
        {/* Header */}
        <SoftCard className="rounded-t-none sm:rounded-[1.75rem] lg:rounded-[2rem]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">
                จัดการผู้ใช้งาน
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">
                เจ้าของกิจการสามารถเพิ่มพนักงานและกำหนดสิทธิ์ได้
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                variant="secondary"
                className="w-full justify-center rounded-2xl py-3 text-sm sm:w-auto"
                onClick={() => setShowCreate((v) => !v)}
              >
                {showCreate ? <X size={16} /> : <Plus size={16} />}
                {showCreate ? 'ปิดฟอร์ม' : 'เพิ่มผู้ใช้'}
              </Button>

              <Button
                variant="secondary"
                className="w-full justify-center rounded-2xl py-3 text-sm sm:w-auto"
                onClick={load}
              >
                <RefreshCw size={16} />
                Refresh
              </Button>
            </div>
          </div>
        </SoftCard>

        {/* Alert */}
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-700 sm:rounded-3xl">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-700 sm:rounded-3xl">
            {success}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:gap-6">
          {/* Create User */}
          {showCreate && (
            <SoftCard>
              <div className="mb-5 flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white sm:h-12 sm:w-12 sm:rounded-3xl">
                  <Plus size={22} />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                    เพิ่มผู้ใช้
                  </h2>
                  <p className="text-sm leading-5 text-slate-500">
                    กำหนด role owner/employee
                  </p>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <Input
                  label="ชื่อ"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="เช่น พนักงานขับรถ"
                  required
                />

                <Input
                  label="Username"
                  value={form.username}
                  onChange={(e) => update('username', e.target.value)}
                  placeholder="เช่น employee01"
                  required
                />

                <Input
                  label="Password"
                  type="text"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="password123"
                  required
                />

                <Input
                  label="เบอร์โทร"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="เช่น 0812345678"
                />

                <Select
                  label="สิทธิ์"
                  value={form.role}
                  onChange={(e) => update('role', e.target.value)}
                >
                  <option value="employee">พนักงาน</option>
                  <option value="owner">เจ้าของกิจการ</option>
                </Select>

                <div className="sticky bottom-3 z-20 rounded-2xl bg-white/90 p-2 shadow-xl backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:shadow-none">
                  <Button
                    disabled={saving}
                    className="w-full justify-center rounded-2xl py-4 text-base"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึกผู้ใช้'}
                  </Button>
                </div>
              </form>
            </SoftCard>
          )}

          {/* Users List */}
          <SoftCard>
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-950 sm:h-12 sm:w-12 sm:rounded-3xl">
                <Users size={22} />
              </div>

              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                  ผู้ใช้งานทั้งหมด
                </h2>
                <p className="text-sm text-slate-500">
                  ทั้งหมด {rows.length} คน
                </p>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="grid gap-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black text-slate-950">
                        {row.name || '-'}
                      </p>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        @{row.username || '-'}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {row.phone || 'ไม่มีเบอร์โทร'}
                      </p>
                    </div>

                    <button
                      onClick={() => toggle(row.id)}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-100 hover:text-slate-950"
                    >
                      <Power size={17} />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <span className="flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
                      {row.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน'}
                    </span>

                    <span
                      className={`flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold ${
                        Number(row.is_active)
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {Number(row.is_active) ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </div>
                </article>
              ))}

              {!rows.length && !loading && (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                  ยังไม่มีผู้ใช้งาน
                </div>
              )}

              {loading && (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                  กำลังโหลดข้อมูล...
                </div>
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-100 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="p-3">ชื่อ</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">เบอร์โทร</th>
                    <th className="p-3">สถานะ</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-950">
                        {row.name || '-'}
                      </td>

                      <td className="p-3">{row.username || '-'}</td>

                      <td className="p-3">
                        {row.role === 'owner' ? 'เจ้าของกิจการ' : 'พนักงาน'}
                      </td>

                      <td className="p-3">{row.phone || '-'}</td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            Number(row.is_active)
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {Number(row.is_active) ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => toggle(row.id)}
                          className="rounded-2xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-950"
                        >
                          <Power size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!rows.length && !loading && (
                    <tr>
                      <td
                        className="p-8 text-center text-slate-500"
                        colSpan="6"
                      >
                        ยังไม่มีผู้ใช้งาน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SoftCard>
        </div>
      </div>
    </div>
  )
}