# Mercado Livre — auditoria real dos redirecionamentos de links oficiais (03/11/2026)

## Objetivo

Verificar se os links de afiliado já gerados pelo usuário dependem apenas de parâmetros reutilizáveis ou de um identificador distinto por produto, **sem navegador autenticado, sem publicar, e sem tentar gerar links pela API de vendedores**.

## Método

- Dois links `meli.la` previamente registrados como `source_type=manual` no banco do usuário foram consultados no Supabase por uma função temporária isolada, autorizada por hash do segredo já existente no Vault.
- A requisição HEAD devolveu 405; nenhuma informação de redirecionamento.
- Requisições GET com `redirect:manual` retornaram HTTP 301. O teste leu apenas o cabeçalho Location. Não abriu o destino, não coletou HTML nem gerou clique repetitivo.
- Os dois destinos foram `www.mercadolivre.com.br/social/lucasbrasildf`, com parâmetros `matt_word`, `matt_tool`, `forceInApp` e `ref`.
- **`matt_word`: idêntico nos dois links. `matt_tool`: idêntico nos dois links. `ref`: diferente entre os dois links.** Comprimento dos valores ref: 264 e 260 caracteres. Os valores brutos, tokens e credenciais não foram incluídos no relatório.
- As duas referências opacas não contêm o ID MLB em texto simples.

## Conclusão técnica

O resultado é consistente com um identificador estável de afiliado + uma referência específica da recomendação/produto. Assim, reconstruir um link oficial do tipo `/social/...&ref=...` para um produto **novo** não é algo que possa ser feito reutilizando o ref de outro produto.

É possível tecnicamente montar uma URL direta do produto acrescentando `matt_word`/`matt_tool`, como algumas ferramentas terceiras afirmam fazer. **Porém, não foi provado que a URL editada constitui um Link Especial reconhecido ou gera comissão.** O documento oficial recomenda o Gerador ou a Barra de Afiliados. A existência de parâmetros de identificação não substitui validação de atribuição ou autorização de uso.

Páginas oficiais:
- https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
- https://www.mercadolivre.com.br/l/afiliados-direcionamento-de-visitas
- https://www.mercadolivre.com.br/l/organize-seus-links

## Efeitos e encerramento

- Nenhuma geração oficial de link novo, nenhuma publicação, nenhuma inserção em `flow_offers` ou filas de entrega.
- Nenhuma chamada à API de catálogo Mercado Livre (em pausa após HTTP 429).
- Função temporária `ml-official-link-redirect-audit` fechada na versão 4, stub que responde 410 e exige JWT. Não foi criado cron.
- Produção Shopee/Magalu não foi alterada.

## O próximo gate útil

**Validar atribuição real e elegibilidade** de uma URL de produto direto montada com a dupla de parâmetros identificada, comparando-a a um link gerado pela ferramenta oficial para um produto específico. A validação deve usar tráfego orgânico legítimo e métricas da plataforma, não compras próprias, cliques artificiais nem testes em grupos públicos. Até que isso se comprove, a URL direta deve permanecer experimental, não publicável.

Se essa via não for reconhecida, o único caminho identificado para links oficiais novos ainda envolve a interface/sessão de afiliado; OAuth comum de vendedor não implementa geração de links de afiliado.
