# Roadmap do Studio

## Fase 1 — fluxo de produção

- [x] Briefing com aprovação por etapas.
- [x] Navegação para Studio em todas as páginas.
- [ ] Persistir projetos no PostgreSQL.

## Fase 2 — processamento local

- [ ] Upload de vídeo com validação de formato e tamanho.
- [ ] Transcrição local com Whisper/FunASR.
- [ ] Lista de cortes sugeridos com timestamps.
- [ ] Renderização de Shorts 9:16 com FFmpeg/Remotion.
- [ ] Legendas SRT/ASS e revisão no painel.

## Fase 3 — publicação oficial

- [ ] OAuth do YouTube com `youtube.upload`.
- [ ] Upload resumível e acompanhamento de processamento.
- [ ] Agendamento com `status.publishAt` enquanto o vídeo permanece privado.
- [ ] OAuth da Meta para contas profissionais elegíveis.
- [ ] Fila, aprovação final e histórico por destino.

O sistema não usará scraping, login privado, cookies de sessão ou publicação sem aprovação.
