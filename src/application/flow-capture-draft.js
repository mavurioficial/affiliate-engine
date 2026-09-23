export function createFlowCaptureDraftStorage(storage, key) {
  return {
    read() {
      try {
        const raw = storage?.getItem(key)
        if (!raw) return ''
        const payload = JSON.parse(raw)
        return typeof payload?.affiliateUrl === 'string'
          ? payload.affiliateUrl
          : ''
      } catch {
        return ''
      }
    },

    write(affiliateUrl) {
      const value = String(affiliateUrl || '').trim()
      if (!value) {
        this.clear()
        return
      }

      try {
        storage?.setItem(key, JSON.stringify({
          affiliateUrl: value,
          savedAt: new Date().toISOString()
        }))
      } catch {
        // Draft persistence is best-effort and must never block the Flow.
      }
    },

    clear() {
      try {
        storage?.removeItem(key)
      } catch {
        // Ignore storage failures.
      }
    }
  }
}
