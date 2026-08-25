import { CatalogRepository } from '../../application/catalog-repository.js'

class LocalCatalog extends CatalogRepository {
  constructor(key, seedEntries) {
    super()
    this.key = `mavuri-affiliate-engine:${key}`
    this.seedEntries = seedEntries
    this.entries = this.load()
    this.nextId = this.entries.reduce((max, entry) => {
      const match = String(entry.id).match(/local-(\d+)/)
      return match ? Math.max(max, Number(match[1])) : max
    }, this.entries.length) + 1
  }

  load() {
    try {
      const saved = localStorage.getItem(this.key)
      if (!saved) return [...this.seedEntries]
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : [...this.seedEntries]
    } catch {
      return [...this.seedEntries]
    }
  }

  persist() {
    localStorage.setItem(this.key, JSON.stringify(this.entries))
  }

  refreshNextId() {
    this.nextId = this.entries.reduce((max, entry) => {
      const match = String(entry.id).match(/local-(\d+)/)
      return match ? Math.max(max, Number(match[1])) : max
    }, this.entries.length) + 1
  }

  list() { return [...this.entries] }

  create(entry) {
    const record = { ...entry, id: entry.id || `local-${this.nextId++}` }
    this.entries = [...this.entries, record]
    this.persist()
    return record
  }

  update(id, changes) {
    const index = this.entries.findIndex((entry) => entry.id === id)
    if (index < 0) return null
    const record = { ...this.entries[index], ...changes, id }
    this.entries = this.entries.map((entry, i) => i === index ? record : entry)
    this.persist()
    return record
  }

  remove(id) {
    const exists = this.entries.some((entry) => entry.id === id)
    if (!exists) return false
    this.entries = this.entries.filter((entry) => entry.id !== id)
    this.persist()
    return true
  }

  replace(entries) {
    if (!Array.isArray(entries)) throw new Error('Dados inválidos para o catálogo.')
    this.entries = entries.map((entry) => ({ ...entry }))
    this.refreshNextId()
    this.persist()
  }

  reset() {
    this.entries = this.seedEntries.map((entry) => ({ ...entry }))
    this.refreshNextId()
    localStorage.removeItem(this.key)
  }
}

export const developmentCatalogs = {
  markets: new LocalCatalog('markets', [{ id: 'br', name: 'Brasil', description: 'Mercado inicial do MVP.', locale: 'pt-BR', currency: 'BRL' }, { id: 'us', name: 'Estados Unidos', description: 'Mercado previsto para expansão.', locale: 'en-US', currency: 'USD' }]),
  operations: new LocalCatalog('operations', [{ id: 'mavuri-br', name: 'Mavuri Brasil', description: 'Operação demonstrativa para o mercado brasileiro.', markets: ['Brasil'], languages: ['Português', 'Inglês'] }]),
  platforms: new LocalCatalog('platforms', [{ id: 'catalogo-demo', name: 'Catálogo demonstrativo', description: 'Origem local usada somente para validar a interface.', status: 'Planejada' }]),
  products: new LocalCatalog('products', [{ id: 'fone-demo', name: 'Fone sem fio demonstrativo', description: 'Produto fictício sem origem ou preço reais.', platform: 'Catálogo demonstrativo', category: 'Eletrônicos' }]),
  offers: new LocalCatalog('offers', [{ id: 'oferta-demo', name: 'Oferta demonstrativa', description: 'Condição ilustrativa; não está disponível para publicação.', product: 'Fone sem fio demonstrativo', market: 'Brasil', status: 'Em revisão' }]),
  affiliateLinks: new LocalCatalog('affiliate-links', [{ id: 'link-demo', name: 'Link demonstrativo', description: 'URL fictícia, sem rastreamento ou redirecionamento.', offer: 'Oferta demonstrativa', platform: 'Catálogo demonstrativo', destination: 'Não configurado' }]),
  channels: new LocalCatalog('channels', [{ id: 'telegram', name: 'Telegram', description: 'Canal previsto para a primeira integração futura.', capability: 'Destinos e publicações futuras', status: 'Planejado' }, { id: 'whatsapp', name: 'WhatsApp', description: 'Canal mantido como possibilidade de expansão.', capability: 'A definir', status: 'Planejado' }]),
}
