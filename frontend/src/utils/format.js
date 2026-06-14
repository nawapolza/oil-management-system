export const thb = (value) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value || 0))

export const num = (value, digits = 2) =>
  new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(Number(value || 0))

export const dateTH = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value))
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const monthStartISO = () => {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
