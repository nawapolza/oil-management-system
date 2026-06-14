const DEFAULT_API = import.meta.env.DEV
  ? '/api'
  : 'http://localhost/oil-management-system/backend/public/index.php'

const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API).replace(/\/$/, '')

function buildUrl(path) {
  if (API_BASE.endsWith('index.php')) {
    const [routePath, queryString] = path.split('?')
    return `${API_BASE}?route=${encodeURIComponent(routePath)}${queryString ? `&${queryString}` : ''}`
  }
  return `${API_BASE}${path}`
}

export const fileUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  if (API_BASE.endsWith('index.php')) {
    return API_BASE.replace(/\/index\.php$/, path)
  }
  if (API_BASE === '/api') {
    return path
  }
  return `${API_BASE}${path}`
}

export const tokenStore = {
  get: () => localStorage.getItem('oilops_token'),
  set: (token) => localStorage.setItem('oilops_token', token),
  clear: () => localStorage.removeItem('oilops_token'),
}

async function request(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const isForm = options.body instanceof FormData
  if (!isForm && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(buildUrl(path), {
      ...options,
      headers,
      body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (err) {
    throw new Error(
      `เชื่อมต่อ Backend ไม่ได้ (${API_BASE}) กรุณาเปิด XAMPP Apache + MySQL, วางโฟลเดอร์ไว้ที่ C:/xampp/htdocs/oil-management-system และทดสอบเปิด http://localhost/oil-management-system/backend/public/index.php?route=/ ก่อน`
    )
  }

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { success: false, message: text || 'Invalid server response' }
  }

  if (!res.ok) {
    const error = new Error(data.message || 'เกิดข้อผิดพลาด')
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}

export const api = {
  base: API_BASE,
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me'),
  vehicles: () => request('/vehicles'),
  createVehicle: (payload) => request('/vehicles', { method: 'POST', body: payload }),
  users: () => request('/users'),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  toggleUser: (id) => request(`/users/${id}/toggle`, { method: 'PATCH' }),
  deliveries: (params = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    return request(`/deliveries${qs.toString() ? `?${qs}` : ''}`)
  },
  createDelivery: (payload) => request('/deliveries', { method: 'POST', body: payload }),
  updateDelivery: (id, payload) => request(`/deliveries/${id}`, { method: 'PUT', body: payload }),
  deleteDelivery: (id) => request(`/deliveries/${id}`, { method: 'DELETE' }),
  uploadPhoto: (id, file) => {
    const form = new FormData()
    form.append('photo', file)
    return request(`/deliveries/${id}/upload`, { method: 'POST', body: form })
  },
  stats: (params = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    return request(`/dashboard/stats${qs.toString() ? `?${qs}` : ''}`)
  },
  notifications: () => request('/notifications'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
}
