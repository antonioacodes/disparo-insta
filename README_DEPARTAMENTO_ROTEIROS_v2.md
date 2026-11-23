# Departamento de Roteiros e Produção de Vídeos (v2)

Este documento é um módulo complementar ao `README_ESCRITORIO_VIRTUAL.md`. Ele descreve o quarto agente, o **Roteiros**, e a produção de vídeos a partir de roteiro, com as decisões técnicas já fechadas.

Leia também as seções de arquitetura, estados dos agentes e critérios de qualidade do README do escritório. Em caso de conflito, este documento prevalece para tudo que trata de roteiros e produção de vídeo.

---

## 0. Instruções para o Codex

Antes de qualquer alteração:

1. Leia este documento e o `README_ESCRITORIO_VIRTUAL.md`.
2. Verifique os recursos reais da VPS e registre o resultado em `docs/recursos_vps.md`: `free -h`, `nproc`, `df -h` e a versão do sistema.
3. Apresente um resumo curto do mapeamento do código existente, sem esperar aprovação para seguir, a menos que encontre conflito com as regras da seção 2.

Regras que não podem ser quebradas:

- **Nenhuma chave de API paga nesta versão.** As únicas chaves são a do Pexels (`PEXELS_API_KEY`) e, se necessário, a do próprio Ollama, que não exige chave. Nenhuma chave vai para o código, para o repositório ou para logs.
- **Nenhum serviço pago de IA.** Não integre ElevenLabs, provedores de modelo de linguagem por API, nem serviços de geração de vídeo ou imagem por IA.
- **Nenhuma publicação automática.** Publicar continua bloqueado até a proteção das rotas da VPS ser confirmada. Enquanto isso, o botão fica desabilitado com a mensagem "Ação disponível após confirmação de acesso".
- **Aprovação humana obrigatória** em dois pontos: após o roteiro e antes da publicação. Nenhuma produção de vídeo começa sem roteiro aprovado.
- **Um job pesado por vez na VPS.** Geração de roteiro e renderização de vídeo não rodam ao mesmo tempo.
- **Nenhum job disparado ao abrir telas.**
- **Não invente métricas.** Dado inexistente aparece como "Sem dados ainda".

---

## 1. Decisões fechadas

| Tema | Decisão |
|---|---|
| Recursos da VPS | 8 GB de RAM, CPU sem GPU |
| Escrita de roteiro | Modelo de linguagem de 7B, rodando localmente com Ollama, somente em CPU |
| Banco de b-roll | Pexels API (gratuita, com limite de uso) |
| Narração | Piper (local, em CPU), com voz em português |
| Montagem | FFmpeg |
| Legendas | Geradas a partir do texto do roteiro e da duração real de cada áudio |
| Voz paga | ElevenLabs fora do escopo |
| API paga de modelo de linguagem | Fora do escopo nesta versão |
| Geração de vídeo ou imagem por IA | Fora do escopo nesta versão |
| Volume | Baixo: poucos roteiros e poucas produções por vez. Tempo de execução não é critério |
| Publicação | Bloqueada até confirmação de acesso às rotas |

---

## 2. Orçamento de recursos da VPS

Com 8 GB de RAM, a memória é o recurso mais apertado. O modelo de 7B quantizado ocupa a maior parte dela. Por isso as regras abaixo são obrigatórias.

**Estimativa de uso (valores aproximados, confirmar na medição):**

| Componente | Memória estimada |
|---|---|
| Sistema operacional e serviços básicos | 1 a 1,5 GB |
| Plataforma (Next.js, banco, worker Python) | 1 a 1,5 GB |
| Modelo 7B quantizado em Q4 (Ollama) | 4,5 a 5 GB |
| Contexto do modelo (cache de atenção) | 0,3 a 0,8 GB, depende do tamanho do contexto |
| Piper e FFmpeg durante produção | 0,3 a 0,6 GB |

Conclusão: o modelo cabe, mas não há folga para rodar dois processos pesados ao mesmo tempo. Por isso:

- **Modelo 7B em quantização Q4_K_M** (ou equivalente de 4 bits). Modelos em 8 bits ou sem quantização não cabem com segurança.
- **Contexto limitado a 4096 tokens** para o roteiro. O roteiro é gerado em blocos (ver seção 4.2), o que mantém o contexto pequeno.
- **Um modelo carregado por vez.** Configure o Ollama para descarregar o modelo quando ficar ocioso (`OLLAMA_KEEP_ALIVE` com valor curto) e para não manter dois modelos na memória.
- **Fila única de processamento pesado.** Roteiro, narração e renderização passam por uma mesma fila, executada em sequência. Nenhum dos três roda junto com outro.
- **Swap como rede de segurança, não como plano.** Se a VPS não tiver swap configurado, avalie criar um arquivo de swap, mas registre que swap em uso frequente deixa a geração muito mais lenta.
- **Medição antes de liberar.** Antes de habilitar a geração de roteiros, rode um teste e registre em `docs/recursos_vps.md`: memória de pico, tempo de geração de 1 minuto de texto, e se houve uso de swap.

Se o pico de memória durante a geração passar de 6,5 GB, reduza o contexto ou troque por um modelo menor, e registre a decisão.

---

## 3. Modelo de linguagem para roteiros

### 3.1 Candidatos

Teste pelo menos dois candidatos com o mesmo briefing, em português, antes de escolher:

- **Qwen2.5 7B Instruct.** Boa qualidade em português, licença Apache 2.0 para a maioria das versões. Disponível no Ollama como `qwen2.5:7b`.
- **Mistral 7B Instruct.** Licença Apache 2.0 em versões anteriores. Verifique a versão e a licença atuais antes de escolher.

Confira a tag exata, a licença e o tamanho do arquivo no catálogo do Ollama no momento da implementação. Registre o modelo escolhido, a versão e a licença em `docs/modelos.md`.

### 3.2 Critérios de escolha

Compare os candidatos com o mesmo briefing e avalie:

1. Aderência à estrutura (gancho, contexto, escalada, virada, fechamento).
2. Qualidade do português, sem trechos em outro idioma.
3. Frases curtas, adequadas para narração.
4. Presença de fontes para dados factuais, ou marcação "verificar".
5. Ausência de repetição entre cenas.
6. Memória de pico e tempo de geração na VPS.

### 3.3 Qualidade e fatos

Um modelo local pode inventar datas, nomes e números. Por isso:

- O prompt do sistema exige fonte para cada dado factual. Se a fonte não estiver no briefing, o trecho deve ser marcado como `"verificar": true`.
- Roteiros com trechos marcados não avançam para produção sem revisão humana.
- Você revisa o roteiro antes de qualquer produção.

---

## 4. O agente Roteiros

### 4.1 Função

- Receber um briefing estruturado.
- Gerar um roteiro completo, em blocos, com estrutura de vídeo longo ou de Shorts.
- Gerar títulos, ganchos, descrição e tags, em tarefas curtas separadas.
- Manter histórico de roteiros, com versões e status.

### 4.2 Geração em blocos

Gerar o roteiro inteiro de uma vez exige contexto grande e aumenta a chance de repetição. O processo deve ser dividido:

1. **Planejamento.** Gerar a lista de cenas com tipo, duração estimada e objetivo de cada uma.
2. **Escrita por bloco.** Gerar a narração de um bloco por vez (gancho, contexto, desenvolvimento, virada, fechamento), passando como contexto apenas o resumo do que já foi escrito e a cena atual.
3. **Termos de b-roll.** Gerar os termos de busca em inglês para cada cena.
4. **Revisão automática de tempo.** Estimar a duração de cada narração pela contagem de palavras (valor de referência: cerca de 130 a 150 palavras por minuto em português narrado) e comparar com o alvo.

Cada etapa é um job separado, com progresso registrado. Se uma etapa falhar, só ela é reprocessada.

### 4.3 Formato do briefing

```json
{
  "titulo_provisorio": "string",
  "nicho": "string",
  "tom": "string",
  "duracao_alvo_segundos": 540,
  "formato": "longo | shorts",
  "publico": "string",
  "estrutura": ["gancho", "contexto", "desenvolvimento", "virada", "conclusao"],
  "restricoes": ["string"],
  "fontes_de_pesquisa": ["url ou referência"]
}
```

Validar o JSON antes de salvar. Formato `shorts` usa vertical 1080x1920. Formato `longo` usa horizontal 1920x1080.

### 4.4 Formato do roteiro

```json
{
  "id": "roteiro_0001",
  "versao": 1,
  "status": "aguardando_aprovacao",
  "cenas": [
    {
      "id": "c01",
      "tipo": "gancho",
      "duracao_segundos": 25,
      "narracao": "Texto exato para o TTS, com números por extenso.",
      "b_roll_busca": ["termo em inglês", "outro termo"],
      "estilo_visual": "planos longos, cor fria",
      "legenda_destaque": "Frase curta para destaque.",
      "fontes": ["referência do dado factual, se houver"],
      "verificar": false
    }
  ],
  "titulo_sugerido": ["string"],
  "descricao": "string",
  "tags": ["string"],
  "aviso_ia": true
}
```

### 4.5 Regras de escrita para o prompt do sistema

- Frases curtas, uma ideia por frase.
- Números por extenso.
- Estrutura: gancho nos primeiros 10 a 30 segundos, contexto curto, escalada com perguntas abertas, virada com dado novo, fechamento que responde ao gancho.
- Termos de b-roll em inglês, substantivos concretos.
- Nenhum nome de pessoa viva e nenhuma acusação sem fonte.
- Não reproduzir textos de outros canais.

### 4.6 Tarefas curtas

Títulos, ganchos alternativos, descrição e tags usam o mesmo modelo, com contexto pequeno. São rápidas e podem rodar na própria fila de roteiro.

---

## 5. Produção do vídeo

### 5.1 Pipeline

Cada etapa é um job com status, início, fim, erro e tentativas.

1. **Cenas.** Quebrar o roteiro aprovado em cenas.
2. **B-roll (Pexels).** Para cada cena, buscar pelo termo de `b_roll_busca`. Baixar o material escolhido, registrar licença, autor e URL de origem em `assets_producao`.
3. **Fallback visual.** Se uma cena não tiver resultado no Pexels, usar fundo de cor sólida com o texto da cena. Registrar o fallback.
4. **Narração (Piper).** Gerar um áudio por cena. Guardar a duração real.
5. **Montagem (FFmpeg).** Uma cena por clipe, com zoom lento de 3% a 8%, transições curtas do mesmo tipo, trilha de fundo opcional em volume baixo com redução durante a narração, e filtro de cor fixo.
6. **Legendas.** Gerar `.srt` a partir do texto do roteiro e das durações reais, com até duas linhas e 35 caracteres por linha, cada bloco entre 1,5 e 3 segundos. Queimar no vídeo com FFmpeg.
7. **Registro.** Gravar tempo de cada etapa e o número de chamadas à API do Pexels.

### 5.2 Pexels

- Chave em `PEXELS_API_KEY`.
- Respeitar o limite de requisições por hora e por mês. Registrar o consumo e pausar a etapa ao se aproximar do limite.
- Cachear buscas e downloads, para não repetir requisições.
- Registrar para cada asset: ID, URL de origem, autor, licença e data de download.
- Verificar os termos de uso e a necessidade de crédito no momento da implementação.

### 5.3 Piper

- Motor local, em CPU.
- Modelo de voz em português configurado em `PIPER_MODEL_PATH`. Verificar as vozes `pt_BR` disponíveis no repositório do Piper e escolher uma.
- Gerar um áudio por cena, em sequência, para não competir por memória.
- Escrever números por extenso antes de enviar ao TTS. Usar pontuação para controlar pausas.

### 5.4 FFmpeg

- Montagem, transições, Ken Burns, mixagem, filtro de cor e queima de legendas.
- Usar presets rápidos e um número de threads configurável (`FFMPEG_THREADS`), para deixar CPU disponível para a plataforma.
- Formato final em H.264 com áudio AAC, adequado para as plataformas.

### 5.5 Intermediários

- Cenas, áudios e clipes baixados ficam em `DIRETORIO_PRODUCAO`, em subpastas por produção.
- Após aprovação final, limpar intermediários, mantendo roteiro, narração final e vídeo final.
- Antes de iniciar uma produção, verificar espaço livre em disco e recusar se for insuficiente.

---

## 6. Tela de revisão e aprovação

- Player do vídeo final, lista de cenas, legendas e tempos de cada etapa.
- Botões: aprovar, devolver com comentário, regenerar uma cena.
- Regenerar uma cena refaz só a narração, o b-roll ou a legenda dela, e não a produção inteira.
- Campo de rotulagem de IA, com aviso para conferir a política de cada plataforma antes de publicar.
- Ao aprovar, o vídeo vai para `aprovado_para_publicacao` e aparece no agente Publicações como "Pronto para publicar". Não publica.

---

## 7. Estados

### 7.1 Estados dos agentes

Não configurado, ocioso, trabalhando, aguardando, erro e interrompido, conforme o README do escritório.

Para o agente Roteiros, "aguardando" significa roteiro aguardando aprovação. Para o agente Edição, durante a produção, o estado deve mostrar a etapa atual (cenas, b-roll, narração, montagem ou legendas).

**Heartbeat obrigatório.** Durante a geração de roteiro e a renderização, o worker envia sinal periódico, a cada 30 segundos. Sem esse sinal, a tela mostraria "interrompido" durante um trabalho que está rodando normalmente.

### 7.2 Estados do roteiro

`rascunho` → `aguardando_aprovacao` → `aprovado` → `em_producao` → `aguardando_revisao_video` → `aprovado_para_publicacao` → `publicado`

Também existem `rejeitado` e `erro`. Um roteiro rejeitado volta para `rascunho` com comentário. Transições inválidas são recusadas e testadas.

### 7.3 Status da produção

`na_fila` → `cenas` → `broll` → `narracao` → `montagem` → `legendas` → `concluida`, com `erro` em qualquer etapa e reprocessamento só dela.

---

## 8. Dados

Tabelas novas:

- `briefings`: dados do briefing e status.
- `roteiros`: versão, status, JSON, data e origem.
- `cenas`: vinculadas ao roteiro, com ordem e campos da seção 4.4.
- `assets_producao`: origem, URL, autor, licença, data de download e cena vinculada.
- `producoes_video`: roteiro, status, etapas, tempos, erros, arquivo final e número de chamadas ao Pexels.
- `agentes_eventos`: heartbeat e mudanças de estado.

Reutilizar as tabelas de jobs e progresso já existentes sempre que possível.

---

## 9. Integração com o escritório

- **Sala Roteiros.** Mesa, monitor, cadeira e personagem no mesmo padrão visual das outras salas. Ao passar o mouse, mostra a etapa atual.
- **Painel de roteiros.** Lista com status e versão. Ações: criar briefing, gerar roteiro, aprovar, rejeitar, pedir nova versão e produzir vídeo.
- **HUD.** Incluir "roteiros aguardando aprovação" e "vídeos em produção".
- **Edição.** Mostra a produção em andamento com a etapa atual, em vez de só a transcrição de vídeos do Studio.

---

## 10. Riscos

### 10.1 Direitos autorais

- Não copiar roteiros, narrações ou trilhas de outros canais.
- Usar apenas material do Pexels com licença verificada, e registrar a origem de cada asset.
- Trilhas sonoras só com licença clara para uso comercial.

### 10.2 Políticas das plataformas

- YouTube exige sinalização de conteúdo sintético realista e tem política contra conteúdo produzido em massa sem valor original. Consulte a central de ajuda da plataforma no momento da publicação.
- Meta tem regras próprias sobre conteúdo gerado por IA. Confira antes de publicar.
- Vídeos com narração sintética e b-roll de banco são aceitos quando têm roteiro original, checagem de fatos e edição própria.

### 10.3 Fatos

- Modelos locais inventam dados com confiança. Revisão humana é obrigatória.
- Nomes de pessoas vivas e acusações sem fonte são proibidos no prompt e na revisão.

### 10.4 Recursos

- Memória é o limite principal. Medir antes de liberar, e manter um modelo por vez.
- Renderização consome CPU. A fila única evita que trave a plataforma.
- Armazenamento cresce com intermediários. Limpar após aprovação.

---

## 11. Plano de ação

### Fase 0: medição e decisões

- Registrar recursos da VPS em `docs/recursos_vps.md`.
- Instalar o Ollama e baixar os dois candidatos de 7B, registrando versão e licença.
- Testar um briefing com cada candidato e escolher um.
- Testar uma voz pt_BR no Piper.
- Testar a API do Pexels com uma busca.

**Critério de aceite:** modelo escolhido, pico de memória abaixo de 6,5 GB, voz escolhida, Pexels respondendo.

### Fase 1: dados e roteiro

- Criar tabelas e validação de JSON.
- Implementar geração de roteiro em blocos, com heartbeat.
- Implementar aprovação, rejeição e versões.

**Critério de aceite:** três roteiros gerados, revisados e aprovados pela interface, com fontes ou marcação "verificar" em todos os dados factuais, sem nenhuma produção disparada automaticamente.

### Fase 2: sala Roteiros no escritório

- Adicionar a sala, personagem e estados.
- Painel de roteiros e ações.

**Critério de aceite:** sala funcional no mapa, estados corretos, abrir a tela não dispara jobs.

### Fase 3: produção de um vídeo de teste

- Cenas, b-roll com Pexels, narração com Piper, montagem com FFmpeg, legendas.
- Fila única e heartbeat durante a renderização.

**Critério de aceite:** um vídeo completo produzido a partir de um roteiro aprovado, com legendas, sem travar a plataforma, e com tempos de cada etapa registrados.

### Fase 4: revisão

- Tela de revisão, regeneração por cena, rotulagem de IA.
- Botão de publicação desabilitado até a confirmação de acesso.

**Critério de aceite:** vídeo aprovado aparece como "Pronto para publicar" no agente Publicações, sem publicar.

### Fase 5: ajustes

- Ajustar prompt, voz, estilo visual e duração com base nos testes.
- Documentar o desempenho real na VPS.

---

## 12. Variáveis de ambiente

Criar `.env.example` com estas variáveis, sem valores:

- `OLLAMA_URL`: endereço do servidor Ollama local.
- `ROTEIRO_MODELO`: tag do modelo de 7B escolhido.
- `OLLAMA_KEEP_ALIVE`: tempo de permanência do modelo na memória.
- `PEXELS_API_KEY`: chave gratuita do Pexels.
- `PIPER_MODEL_PATH`: caminho do modelo de voz em português.
- `FFMPEG_THREADS`: número de threads do FFmpeg.
- `DIRETORIO_PRODUCAO`: pasta de intermediários e finais.
- `ESPACO_MINIMO_GB`: espaço mínimo livre para iniciar uma produção.

---

## 13. Fontes

Confira versões, licenças e termos no momento da implementação.

- Ollama: ollama.com
- Qwen2.5 (catálogo do Ollama): ollama.com/library/qwen2.5
- Mistral (catálogo do Ollama): ollama.com/library/mistral
- llama.cpp: github.com/ggerganov/llama.cpp
- Piper: github.com/rhasspy/piper
- Pexels API: pexels.com/api
- FFmpeg: ffmpeg.org
- Política do YouTube sobre conteúdo alterado ou sintético: central de ajuda do YouTube
- Política da Meta sobre conteúdo gerado por IA: central de ajuda para desenvolvedores e políticas da Meta

---

## 14. Perguntas em aberto

1. Qual nicho e idioma principal? (Português para o público brasileiro, assumido neste documento.)
2. Formato inicial: longo (8 a 12 minutos) ou Shorts?
3. Você quer manter o painel Studio atual como está, ou ele também vai mudar de lugar no escritório?

---

## 15. Resumo

- Roteiros com modelo de 7B em CPU, via Ollama, em blocos, com heartbeat.
- B-roll com Pexels, gratuito, com limite de uso e registro de licença.
- Narração com Piper, local e gratuita.
- Montagem e legendas com FFmpeg.
- Nenhum serviço pago de IA nesta versão.
- Uma fila pesada por vez, com um modelo carregado por vez.
- Aprovação humana antes da produção e antes da publicação.
- Publicação bloqueada até a confirmação das rotas da VPS.
