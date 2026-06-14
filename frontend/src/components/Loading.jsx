export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
        <p className="mt-4 text-sm font-semibold text-slate-500">กำลังโหลดระบบ...</p>
      </div>
    </div>
  )
}
