/**
 * Contrato de leitura independente do armazenamento.
 * Implementações futuras podem consultar uma API ou banco sem mudar a interface.
 */
export class CatalogRepository {
  list() {
    throw new Error('CatalogRepository.list() deve ser implementado pelo adaptador.')
  }
}

