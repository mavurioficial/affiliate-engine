import { CatalogRepository } from '../../application/catalog-repository.js'
import { supabase } from '../../app/auth.js'

class SupabaseCatalog extends CatalogRepository {
  constructor(table) {
    super()
    this.table = table
  }

  async list() {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error

    return data || []
  }

  async create(entry) {
    const { data, error } = await supabase
      .from(this.table)
      .insert(entry)
      .select()
      .single()

    if (error) throw error

    return data
  }

  async update(id, changes) {
    const { data, error } = await supabase
      .from(this.table)
      .update(changes)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return data
  }

  async remove(id) {
    const { error } = await supabase
      .from(this.table)
      .delete()
      .eq('id', id)

    if (error) throw error

    return true
  }
}

export const developmentCatalogs = {
  markets: new SupabaseCatalog('markets'),
  operations: new SupabaseCatalog('operations'),
  platforms: new SupabaseCatalog('platforms'),
  products: new SupabaseCatalog('products'),
  offers: new SupabaseCatalog('offers'),
  affiliateLinks: new SupabaseCatalog('affiliate_links'),
  channels: new SupabaseCatalog('channels'),
}
