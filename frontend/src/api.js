const BASE = import.meta.env.VITE_API_BASE || ''

async function req(path, options) {
  const res = await fetch(BASE + path, options)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body.message) msg = body.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

export const getMeta = () => req('/api/meta')
export const getIndustries = () => req('/api/industries')
export const getIndustry = (code) => req(`/api/industries/${code}`)
export const postRank = (payload) =>
  req('/api/rank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
