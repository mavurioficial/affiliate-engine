# Mercado Livre — login automatizado suspenso após limite de tentativas

**Atualização de segurança — 04/11/2026**

O Mercado Livre apresentou "Você alcançou o limite de tentativas" no Chrome aberto por Playwright. Não repita o login nesse navegador automatizado.

## Situação do Mavuri

- RENOVAR_LOGIN_ML.bat desativado: não abre Chrome, não faz login e não envia requisições.
- ml-session-renew.mjs: captura de sessão desativada. O teste de criptografia fictícia continua disponível.
- Shopee, Magalu e Amazon: ciclos independentes não afetados.
- Mercado Livre: geração e publicação automáticas continuam desligadas.
- OAuth Mercado Livre funciona para endpoints públicos documentados, mas não foi aceito pelas rotas internas de links (401/403).

## Recuperar acesso à conta

1. Feche o Chrome temporário do teste e o processo do .bat.
2. Aguarde a liberação de tentativas pelo próprio Mercado Livre. Não há horário garantido.
3. Utilize apenas o Chrome habitual ou aplicativo oficial e faça login manualmente.
4. Caso o limite persista, procure o suporte de acesso à conta da plataforma.
5. Não compartilhe cookies, tokens, HARs ou cabeçalhos de autenticação no chat.

Não tentaremos modificar o navegador para contornar verificações de segurança.
Mesmo com cookies renovados, o Mercado Livre pode recusar a execução em datacenter.

## Alternativas tecnicamente honestas

1. Integração autorizada: verificar com o programa de afiliados ou parceiros se existe acesso de servidor para gerar links oficiais.
2. Assistência no navegador pessoal: Mavuri prepara os produtos, e o titular usa uma sessão manual normal do Mercado Livre para gerar links oficiais em lote. Não exige PC ligado 24 horas, mas não garante geração contínua na nuvem.
3. Links diretos com etiqueta: apenas como hipótese de teste de atribuição, sem publicação antes de comprovação e conformidade com as regras.

## Referências
- https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
- https://www.mercadolivre.com.br/l/comece-a-recomendar
