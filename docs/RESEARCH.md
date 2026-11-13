# Pesquisa de integrações

## Repositórios analisados

- `subzeroid/instagrapi`: biblioteca Python de API privada/mobile, com login por senha, sessões persistidas, challenges, proxies e uploads. É útil como referência de tratamento de erros e estados de processamento, mas **não deve ser integrada** ao produto: usa fluxos não oficiais e aumenta o risco de bloqueio, perda de sessões e violação das políticas da Meta.
- `dhth/Instagram-API-python`: projeto antigo para consultas/download de mídia por localização e tags, baseado em APIs legadas. Não serve como base para publicação multi-conta atual.

## Decisão para o projeto

O produto usará somente a Instagram Graph API/Meta OAuth para contas profissionais elegíveis. O painel separa a orquestração (contas, campanhas, jobs, idempotência e auditoria) do adaptador Meta. O endpoint `/api/demo/queue` existe apenas para testar o fluxo visual da fila; ele não publica nada.

## Arquitetura planejada

1. OAuth server-side e tokens cifrados; nunca guardar senha, cookie ou `sessionid`.
2. PostgreSQL/Prisma para contas, mídias, campanhas e tentativas.
3. Redis/BullMQ para um job por conta, com chave idempotente, backoff e limites configuráveis.
4. Adaptador Meta com criação/publicação de container apenas quando a permissão, formato e conta forem validados.
5. Auditoria, consentimento de direitos autorais e pausa global em erro de autorização/rate limit.

## Pendências antes do modo real

- Configurar `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` e criptografia de tokens.
- Confirmar contas profissionais elegíveis, permissões e App Review na documentação oficial vigente.
- Confirmar suporte e limites atuais para Feed, Reels, Stories e agendamento.
- Executar testes com uma conta de teste e conteúdo autorizado antes de habilitar múltiplas contas.

Não serão adicionados scraping, endpoints privados, rotação de IP, simulação humana, criação automatizada de contas ou evasão de limites.
