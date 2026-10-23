# Mavuri — migração do Mercado Livre baseada no runner V85/V86 (análise 23/10/2026)

Status: **proposta técnica / sem ativação**. Documento de trabalho do PR #19. Não copiar cookies, sessões, senhas, chaves privadas nem dados do perfil Chrome para o repositório.

## Evidência consultada

Fonte: arquivo do usuário `browser-discovery-v1(20261022-165219).mjs` (5.681 linhas, script local real). O original **não está anexado aqui** por conter detalhes operacionais e material que deve permanecer privado.

### Como o runner atual funciona

1. Inicializa Chrome com perfil persistente exclusivo do Mavuri no Windows e conecta com `playwright-core` via CDP na porta localhost 9222.
2. Detecta sessão autenticada na Central de Afiliados Mercado Livre. A autenticação é do **navegador**, não do token OAuth público do Mercado Livre.
3. Executa busca do Hub por temas rotativos; pool-alvo ML = 250 produtos distintos, no máximo 28 chamadas de descoberta. Normaliza IDs, preços, descontos, cupons, imagens e URLs.
4. Executa busca de variantes do mesmo catálogo, seleção do melhor preço e conciliação com cupons.
5. Consulta o Flow para pré-selecionar **antes** de gerar links. Considera cooldown, classificação, canais e duplicidade; evita consumo desnecessário de geração.
6. Com a sessão válida, cria links próprios do afiliado no contexto autenticado do browser; só aceita como pronto link afiliado efetivamente retornado. **Não criar links genéricos nem reciclar link alheio.**
7. Persiste estado de descoberta por produto no perfil local, reaproveita URLs afiliadas quando apropriado, envia ao `flow-discovery-ingest`, aciona trabalhador e política de republicação após ingestão confirmada. Timeout incerto **não** dispara repetição imediata.
8. Suporta metas por ciclo: **ML até 8, Shopee até 8, Magalu até 5** ofertas únicas; cupons não consomem metas e têm prioridade. WhatsApp está suspenso. V86 reserva até dois links extras para evitar estrangulamento por diversidade.

### Resultados do diagnóstico de origem GitHub Actions (23/10/2026)

- Acesso autenticado ao Hub ML: **403**, loja ML: **403**.
- Teste separado, sem autenticação, em GitHub Actions: `api.mercadolibre.com/sites/MLB` = **403**, `api.mercadolibre.com/currencies/BRL` = **403**, homepage = **403**.
- O login Mavuri/Supabase funcionou; a Shopee API retornou candidatos.
- Isto indica uma **restrição/negação do acesso a partir daquele ambiente**, sem comprovar uma regra universal de bloqueio de toda nuvem. Não contornar mecanismos de acesso nem assumir que outro datacenter será aceito.
- OAuth ML existente é conexão distinta e **não equivale a permissão para usar as ferramentas privadas do Hub de Afiliados** ou gerar `meli.la`.

## Arquitetura proposta, sem reescrever regras de ofertas

**A. Nuvem independente do navegador:** Shopee por Open API; Supabase fornece classificação e decisões, ingest/filas e Telegram; GitHub Actions pode fazer apenas testes e tarefas compatíveis.

**B. Worker Mercado Livre com navegador persistente, somente em ambiente autorizado:** processo Node + Playwright num host 24/7 com navegador local e perfil persistente seguro. Adaptar caminhos de Windows e inicialização do Chrome ao SO do host. Depende de **um teste prévio real de acesso legítimo ao Hub** naquele host e das políticas do Mercado Livre. Não submeter cookies/chaves ao GitHub. CDP acessível **somente por localhost**. Não colocar o perfil de navegador em contêiner efêmero, GitHub Actions ou GitHub.
   
**C. Reaproveitar integralmente:** funções de normalização, pool diversificado, Best Price, Coupon Matcher, pré-seleção por Flow, geração de links da conta, scoring, cupom prioritário, políticas de 48h e republicação controlada, diversidade por canal, metas 8/8/5.

**D. Estado e exclusão mútua:** migrar apenas estado operacional **não secreto** para banco/armazenamento privado; usar lease com vencimento para impedir concorrência de cloud e Windows. O projeto ainda **não** tem lease ativado em produção. Primeiro ensaios read-only; um teste de publicação explícita e limitada; só então agendamento de 30 min.

## Gates, em ordem

1. **Origem/rede do worker ML**: testar, sem publicar nem tentar driblar bloqueios, se browser com sessão autorizada acessa Hub e funções usuais no host candidato. Se 403, não insistir nem alterar fingerprints/proxies; usar alternativa autorizada e manter ML sem habilitar.
2. **Paridade estática V86**: portar utilitários do navegador Windows para Linux/host escolhido, separar os módulos ML/Shopee/Magalu sem alterar algoritmos, criar testes locais sobre fixtures sem credenciais.
3. **Dry-run autenticado no host aprovado**: conferir pool, categorias, link afiliado e simulação dos destinos, sem criar links nem inserir jobs.
4. **Publicação supervisionada**: até uma oferta por plataforma, validando vínculo do link afiliado e rotas Telegram; sem WhatsApp.
5. **Ativação gradual**: após confirmar métricas e cooldown/duplicidade, alternar ownership local/cloud sem execução simultânea, habilitar ciclo de 30 min e monitorar erros.

## Dependências/restrições

- O worker ML tem dependência de navegador com estado persistente, memória e volume privado; VM pequena que já execute WAHA pode não suportar Chrome confiavelmente; dimensionar após teste.
- 403 na origem GitHub impede tratar GitHub Actions como executor de ML. VPS de outro provedor/Oracle **não garante** sucesso; testar acesso legítimo antes de qualquer gasto.
- Links já gravados `meli.la` ficam preservados. Nunca remover afiliação, usar links de terceiros ou publicar oferta sem evidência de vínculo.
- Integração Shopee vinculada em 23/10/2026 (App ID confirmado), mas identificação externa da conta afiliada ainda precisa validação separada antes do primeiro write.
- Não ativar Cron/Cloud publishing, não colocar V85/V86 no repositório público, não mudar o ambiente de produção nesta fase.
