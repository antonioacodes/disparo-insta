# Disparo Insta

Protótipo de uma central de gerenciamento de contas profissionais do Instagram, com foco em publicação autorizada e conformidade com a Meta.

## Estado atual

Esta primeira entrega contém a interface inicial do dashboard, com navegação, indicadores, contas recentes e atalhos. As integrações com OAuth, filas, banco e publicação só devem ser implementadas após validação da documentação atual da Meta, permissões, elegibilidade e App Review.

## Executar

```bash
npm install
npm run dev
```

## Próximos módulos

- OAuth oficial da Meta e armazenamento server-side criptografado de tokens.
- Prisma/PostgreSQL para contas, campanhas, mídias e histórico.
- Redis/BullMQ para jobs independentes por conta, idempotência e retentativas recuperáveis.
- Validação de uploads, autenticação do administrador e logs de auditoria.

Não são usados scraping, endpoints privados, cookies de sessão, rotação de IP ou automação de login.
