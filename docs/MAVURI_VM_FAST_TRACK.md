# Mavuri 24 horas — caminho rápido: V85 em Linux VM com navegador próprio

**Estado: kit de instalação preparado e testado, NÃO INSTALADO em nenhuma VM.** É uma alternativa à reescrita integral de Shopee/Mercado Livre/Magalu como Edge Functions. Mantém os alvos **8 ML / 8 Shopee / 5 Magalu** e cupons fora da contagem. WhatsApp continua desativado. PR #19 em DRAFT.

## Por que avaliar esta rota

O V85 original (analisado de arquivo fornecido em 22/10/2026, **não versionado**) tem cerca de 5.681 linhas e já faz:
- Mercado Livre com Chrome autenticado (Best Price, cupons e links de afiliado);
- Shopee com Affiliate GraphQL e ingest;
- Magalu lendo canais via Telegram MTProto, enriquecendo no navegador;
- publicação através de funções `flow-discovery-ingest`, `flow-shopee-ingest`, `flow-magalu-ingest` e `flow-worker` **já existentes no Supabase**;
- execução por rodada. Falta uma máquina Linux permanentemente ligada com Chrome e as sessões da conta.

O caminho de VM preserva praticamente todo esse trabalho em vez de migrar os coletores um a um. **Não significa que seja plug-and-play**: autenticação ML, login Mavuri no navegador, Telegram MTProto, dependências Linux, versões Node/Chrome e regras de republicação precisam de validação real.

### Atenção ao custo/memória

Oracle Always Free AMD `VM.Standard.E2.1.Micro` tem **1 GB RAM**, inadequado como padrão para Chrome + Node/MTProto concorrentes. **A VM existente `mavuri-waha-amd` foi medida previamente em ~945 MiB RAM, com swap ~944 MiB e instabilidade SSH sob WAHA; NÃO tentar colocar o Discovery V85/Chrome nela.** Oracle Ampere A1 (ARM) pode oferecer mais memória grátis dentro da cota e **sujeito a disponibilidade**; Chrome/Chromium ARM, login e bibliotecas têm de ser testados. Para menor fricção, um VPS Linux com **4 GB ou mais** de RAM é uma hipótese de dimensionamento inicial, não garantia de desempenho. **Não mudar de plano/provedor nem criar VM paga sem aprovação.**

## Arquivos já criados

- `scripts/cloud-runner/sanitize-v85.mjs`: processa o arquivo V85 **localmente**, removendo fallbacks embutidos de API hash Telegram, segredo Shopee e token local Amazon; cria cópia privada `0600`. Por padrão também evita iniciar o coletor Amazon local (fora das metas 8/8/5). **Não presume que removemos todo segredo oculto**: revisar o script com um scanner local antes de transportar.
- `scripts/cloud-runner/validate-v85.mjs`: checa revisão V85, Node >=24, diretórios, 2 GB mínimos, arquivo MTProto com permissões `0600`, presença de variáveis sem revelar valores e flags de corte. Nunca envia nada. `MAVURI_AUTO_INGEST=false` afeta **apenas o ML** no V85; Shopee/Magalu/cupons **podem publicar**.
- `scripts/cloud-runner/run-v85.sh`: falha por padrão; requer `MAVURI_CLOUD_LIVE_ENABLED=YES_EXCLUSIVE_CLOUD_EXECUTOR`, `MAVURI_CLOUD_WINDOWS_STOPPED=CONFIRMED`, `MAVURI_AUTO_INGEST=true` e marcador local criado **após revisão**; `flock` impede rodadas simultâneas **na mesma VM**, não substitui exclusão mútua entre Windows/cloud.
- `systemd/mavuri-chrome.service`: Chrome headless com perfil persistente e CDP `127.0.0.1:9222` (NUNCA abrir o porto ao público); reinicialização sob demanda.
- `systemd/mavuri-discovery.service`, `systemd/mavuri-discovery.timer`: timer de 30 em 30 minutos, desligado até instalação e aprovação.
- `scripts/cloud-runner/discovery.env.example`: apenas nomes, metas e placeholders vazios. Guardar o arquivo real somente na VM em `/etc/mavuri/discovery.env` com permissões `0600`.
- `private/` no `.gitignore`: arquivo V85 sanitizado, `node_modules` e arquivos privados ficam fora do GitHub.

## Sequência de implantação proposta (NÃO EXECUTAR NA PRODUÇÃO AGORA)

1. Confirmar VM existente com usuário não-root, **>=2 GB (preferir 4+ GB)**, arquitetura e Chrome/Chromium disponível; instalar Node 24 e `flock`/bibliotecas de navegador. Não reaproveitar VM WAHA com pouca RAM sem medição.
2. Colocar repositório em `/opt/mavuri/affiliate-engine`, usuário Linux `mavuri`. Instalar dependências `playwright-core` e `teleproto` **com versões controladas** em `private/node_modules` (preservar lockfile local, não compartilhar sessões).
3. Rodar sanitizador **na máquina que contém o V85 original**, e enviar o arquivo resultante via **SFTP/SSH criptografado** ao diretório `private/` na VM. Não usar URL pública nem commit. Revisar secrets embutidos e permissões.
4. Criar `/var/lib/mavuri` (owner `mavuri`, 0700) para cache/estado/Chrome; `/etc/mavuri/discovery.env` para config secreta, 0600; sessão MTProto 0600. Autenticar novamente Mercado Livre e o Mavuri no Chrome Linux **pela própria VM** — cookies Windows não são portáveis com segurança. Confirmar autenticação Telegram por leitura sem publicar.
5. Iniciar **somente Chrome**: testar login e CDP via SSH tunnel sem expor porta. Rodar `node scripts/cloud-runner/validate-v85.mjs` sem `--live` para revisar pré-requisitos.
6. Antes de permitir execução do V85: testar substituição do Windows, **exclusão mútua com produção**, integridade de todas as 4 regras e preço/cupom, rollback, e comprovar que runtime único respeita a janela 48h, preço >=10% e diversidade. O V85 original ainda tinha pré-filtros 24h/5% em alguns trechos; gates SQL de produção podem impor mínimo, mas essa compatibilidade deve ser examinada.
7. Somente depois criar marcador e mudar as 3 flags de aprovação no arquivo secreto; começar com uma rodada observada, sem Cron, e conferir Telegram/DB. Habilitar `mavuri-discovery.timer` **apenas após** os testes. Nunca ligar runner local e cloud ao mesmo tempo.
8. Se falhar, desabilitar timer e zerar a flag; reavaliar antes de religar V85 local. Não reiniciar o cloud sozinho após um erro de autenticação.

## Avanço de 23/10/2026 — prova de acesso antes da instalação

O kit ganhou duas proteções adicionais **sem alterar o runner Windows**:

- O arquivo privado gerado por \`sanitize-v85.mjs\` agora tem um *kill switch próprio*, que exige Linux, \`MAVURI_CLOUD_LIVE_ENABLED=YES_EXCLUSIVE_CLOUD_EXECUTOR\`, \`MAVURI_CLOUD_WINDOWS_STOPPED=CONFIRMED\`, \`MAVURI_AUTO_INGEST=true\` **e o marcador local de revisão** antes mesmo de buscar cupons, consultar marketplace ou publicar. Executar a cópia diretamente com \`node\` não contorna essas proteções.
- Se o Chrome/CDP já gerenciado na VM não estiver pronto, a cópia privada **não** inicia um Chrome avulso no Linux. A unidade \`mavuri-chrome.service\` é a única responsável pelo navegador; sua porta CDP deve continuar limitada a localhost.

Foi criado \`scripts/cloud-runner/ml-origin-readonly.mjs\`, um teste de **somente leitura** para uma VM futura, executado manualmente somente *após* o serviço privado de Chrome e login autorizado. Exemplo no host:

\`\`\`bash
cd /opt/mavuri/affiliate-engine
node scripts/cloud-runner/ml-origin-readonly.mjs
\`\`\`

Saída: somente \`chrome_cdp\`, \`hub_http\`, \`home_http\`, \`login_redirect\`, \`hub_authenticated\`, \`both_403\` e \`status\`. Não exporta cookies, conteúdo da página, links, tokens ou IDs. Abre o Hub uma vez e, **somente se o Hub der 403**, compara uma requisição à página inicial. Não tenta reautenticar, mudar user-agent, contornar proteção ou publicar. Resultado \`authorized_hub\` é condição **necessária, não suficiente**, para seguir com a migração completa; \`denied_both\` bloqueia a rota daquele host até que o acesso seja regularizado.

**Limites práticos**: o teste depende de uma VM legítima com navegador e sessão previamente autenticada; não testa cookies do Windows, não funciona em Supabase Edge e não substitui avaliação dos termos do Mercado Livre. O servidor Oracle AMD de ~1 GB com WAHA continua fora da seleção.


## Critérios de conclusão

Com o Windows desligado e um servidor Node/Chrome em funcionamento, confirmar sucessivas rodadas de 30 minutos, logs por marketplace, metas até 8/8/5 produtos únicos, cupons separados, 4 canais corretos, links de afiliado e preços corretos, sem jobs duplicados. **Sem isso não chamar de “Mavuri 24h pronto”.**

## Pendências práticas

A preparação foi feita pelo GitHub e Supabase conectados, **mas não há acesso a SSH da VM Oracle neste fluxo**. Instalar serviços, abrir o navegador para login e transferir sessões exigem atuação no ambiente VM (ou ferramenta de gerenciamento conectada); não solicitar senhas/tokens no chat. A cloud da Supabase continua read-only e desativada.
