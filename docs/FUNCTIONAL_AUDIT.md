# Auditoria funcional — 2026-08-26

## Objetivo
Validar a aplicação publicada, os fluxos administrativos e as integrações reais antes de continuar adicionando funcionalidades.

## Estado confirmado

### Publicação e sessão
- A aplicação voltou a carregar no GitHub Pages.
- Uma sessão autenticada foi observada na aplicação publicada.
- O dashboard carregou os totais de Mercados, Operações, Plataformas, Produtos, Ofertas, Affiliate Links e Canais.

### Catálogos
- O código possui repositórios Supabase para listar, criar, atualizar e excluir os sete catálogos.
- Ainda é necessário validar cada operação CRUD em execução, incluindo mensagens de erro e persistência após recarregar a página.

### Buscar ofertas — BLOQUEADO
A tela de busca existe no `src/main.js`, mas a árvore do projeto não contém um adaptador de integração de ofertas, cliente do Mercado Livre, backend, função serverless ou outro serviço de consulta externa.

O `README.md` também declara explicitamente que não há integração com plataformas afiliadas ou scraping.

Conclusão: a tela de busca foi criada antes da integração real. O problema não é apenas visual; falta a implementação do provedor de busca.

### Divulgação
A tela existe no `src/main.js`, mas ainda precisa de validação ponta a ponta: preenchimento, geração da mensagem, cópia e uso dos dados reais de uma oferta.

### Exportar / Importar
Os controles existem no `src/main.js`; a validação ponta a ponta ainda é necessária com um backup real e importação em sessão limpa.

## Problemas técnicos encontrados
1. O CSS da interface recente foi separado de `src/styles.css`, indicando divergência entre gerações do layout.
2. `src/main.js` concentra interface, navegação, eventos, busca, divulgação, backup e formulários em um arquivo de aproximadamente 62 KB.
3. O README e parte da documentação estão desatualizados em relação ao uso atual do Supabase.
4. A validação automática atual precisa evoluir de checagem de sintaxe/build para testes de integração e fluxos críticos.

## Prioridade de correção
1. Implementar a integração real de busca de ofertas.
2. Validar CRUD de todos os catálogos.
3. Validar divulgação ponta a ponta.
4. Validar exportação/importação.
5. Consolidar o CSS e recuperar o layout esperado.
6. Criar testes de regressão para impedir nova publicação com tela branca ou funcionalidades desconectadas.

## Regra para próximas alterações
Nenhuma funcionalidade deve ser considerada pronta apenas porque a tela aparece. Cada fluxo deve ser validado com entrada real, ação real, resultado persistido/gerado e novo carregamento quando aplicável.
