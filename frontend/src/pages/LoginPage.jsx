import { useState } from 'react'
import { Droplets, LockKeyhole, UserRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Button from '../components/Button'
import { Input } from '../components/Input'

export default function LoginPage() {
  const { login } = useAuth()

  const [form, setForm] = useState({
    username: '',
    password: '',
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()

    setError('')
    setLoading(true)

    try {
      await login(form.username, form.password)
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-slate-950 text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,.30),transparent_28%),radial-gradient(circle_at_90%_0%,rgba(45,212,191,.22),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(168,85,247,.20),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950" />

      {/* Content */}
      <main className="relative flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <form
          onSubmit={submit}
          className="w-full max-w-[430px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-7 lg:rounded-[2rem]"
        >
          {/* Logo */}
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-slate-950 text-white shadow-lg">
              <Droplets size={30} />
            </div>

            <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Sarawut Oil Management
            </h1>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              ระบบคำนวณและจัดการน้ำมัน
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700">
              {error}
            </div>
          )}

          {/* Login Form */}
          <div className="space-y-4">
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-4 top-9 text-slate-400"
                size={18}
              />

              <Input
                label="Username"
                value={form.username}
                onChange={(e) =>
                  setForm({
                    ...form,
                    username: e.target.value,
                  })
                }
                className="pl-11"
                placeholder="กรอก username"
                autoComplete="username"
                required
              />
            </div>

            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-4 top-9 text-slate-400"
                size={18}
              />

              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({
                    ...form,
                    password: e.target.value,
                  })
                }
                className="pl-11"
                placeholder="กรอก password"
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              disabled={loading}
              className="w-full justify-center rounded-2xl py-4 text-base shadow-lg"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Button>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs leading-5 text-slate-400">
            ใช้งานได้ทั้งมือถือ แท็บเล็ต และคอมพิวเตอร์
          </p>
        </form>
      </main>
    </div>
  )
}