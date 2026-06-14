export function Card({ children, className = '' }) {
  return <div className={`glass-card rounded-3xl p-5 shadow-soft ${className}`}>{children}</div>
}

export function StatCard({ title, value, subtitle, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'from-slate-900 to-slate-700',
    blue: 'from-blue-600 to-cyan-500',
    emerald: 'from-emerald-600 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-600 to-pink-500',
    violet: 'from-violet-600 to-indigo-500',
  }
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${tones[tone]} opacity-15`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`rounded-2xl bg-gradient-to-br ${tones[tone]} p-3 text-white shadow-lg`}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </Card>
  )
}
