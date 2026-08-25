/**
 * Contrato de catálogo independente do armazenamento.
 * Implementações futuras podem consultar uma API ou banco sem mudar a interface.
 */
export class CatalogRepository {
  list() { throw new Error('CatalogRepository.list() deve ser implementado pelo adaptador.') }
  create() { throw new Error('CatalogRepository.create() deve ser implementado pelo adaptador.') }
  update() { throw new Error('CatalogRepository.update() deve ser implementado pelo adaptador.') }
  remove() { throw new Error('CatalogRepository.remove() deve ser implementado pelo adaptador.') }
}
