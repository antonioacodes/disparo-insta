# Escritório Virtual de Agentes

Este documento descreve uma nova funcionalidade para a plataforma existente: um **escritório virtual 2D** onde agentes de IA aparecem como personagens trabalhando em salas, com status, tarefas, histórico e métricas visíveis. Leia tudo antes de começar a implementar.

---

## 1. Contexto da plataforma atual

A plataforma já existente é uma ferramenta de **edição de vídeo** que:

- Gera **legendas** automaticamente para vídeos.
- Faz **cortes** de vídeos (ex.: transformar vídeos longos em clipes curtos).
- Está sendo ajustada para **publicar conteúdo via API da Meta** (Instagram).
- Terá expansão para a **API do Facebook**, para publicação de **Reels**, e para **YouTube Shorts** (YouTube Data API).

Antes de implementar qualquer coisa, mapeie no repositório:

- Os módulos de edição, legendagem e corte já existentes.
- Como as integrações com a Meta funcionam hoje (autenticação, tokens, publicação).
- Como jobs/processamentos são executados hoje (síncrono, fila, worker, etc.).
- Quais rotas, serviços e modelos de dados já existem, para **reaproveitar** em vez de duplicar.

> Se algo descrito aqui já existir no código, reutilize. Se houver conflito entre este documento e o código atual, sinalize antes de decidir.

---

## 2. Objetivo da funcionalidade

Criar um **ambiente visual 2D** (estilo cenário top-down, como um escritório de jogo de simulação) que mostre, em tempo real, o que cada agente de IA está fazendo na plataforma.

O objetivo não é só decorativo: o escritório serve como **painel de monitoramento** do trabalho dos agentes, mostrando tarefas concluídas, pendentes, em andamento e o tempo gasto em cada uma.

---

## 3. Estrutura do cenário

### 3.1 Layout geral

- Um cenário 2D visto de cima, com **3 salas de escritório**, cada uma com **1 agente** (ver seção 4). Ao todo, 3 agentes.
- Uma área externa (rua, calçada, árvores) ao redor, para dar sensação de lugar, como na referência visual.
- Um **personagem controlável** (o "usuário", a pessoa que supervisiona) que pode andar pelo cenário livremente entre as salas e a área externa.
- Um **computador/painel central** (ou um painel por sala) que mostra o painel de monitoramento detalhado (ver seção 6).

### 3.2 Referência visual

A referência é uma imagem de escritório virtual 2D com:
- Salas com mesas, cadeiras, computadores e pequenos detalhes de mobiliário.
- Placas de identificação nas salas (ex.: "Edição", "Tendências", "Publicações").
- Área de reunião e corredores.
- Estilo pixel art / cartoon simples.

Não é necessário replicar exatamente a referência. O estilo deve ser parecido e leve para renderizar.

### 3.3 Requisitos técnicos do cenário

- Renderização em **2D leve** (Canvas, PixiJS ou Phaser, a critério do Codex, justificando a escolha).
- Mapa definido como dados (JSON ou formato Tiled), não hardcoded, para facilitar ajustes.
- Sprites simples, de preferência em um único atlas.
- Deve rodar bem em navegador comum, sem GPU dedicada, porque o servidor VPS não possui GPU. O cliente também deve ser leve.

---

## 4. Agentes

São 3 agentes, cada um em sua sala:

### 4.1 Agente de Edição (sala "Edição")

Responsável por:
- Legendagem de vídeos.
- Cortes de vídeos longos em clipes.
- Preparação dos vídeos para publicação.

Estados visuais do personagem:
- **Ocioso**: o personagem não fica no computador. Deve aparecer descansando, andando pela sala, tomando café, etc.
- **Trabalhando**: o personagem fica sentado no computador. Ao passar o mouse ou clicar, mostrar:
  - Tarefa atual (ex.: "Legendando vídeo X").
  - Tempo decorrido desde o início da tarefa.
  - Próxima(s) tarefa(s) na fila.
  - Estimativa de término, se for possível calcular com base em tarefas anteriores.

### 4.2 Agente de Tendências e Buscas (sala "Tendências")

Responsável por:
- Buscar conteúdos que estão viralizando ou que têm potencial de viralizar.
- Identificar assuntos do momento em redes sociais (Instagram, YouTube, e outras fontes que fizerem sentido).
- Trabalhar sobre um **nicho** ou **palavras-chave** definidos pelo usuário.
- Gerar **relatórios** com os resultados.
- Quando clicado, oferecer **sugestões** do que está em alta (ideias de conteúdo).

Estados visuais:
- **Ocioso**: personagem fora do computador.
- **Buscando**: personagem no computador. Mostrar a busca atual (ex.: "Buscando tendências de: fitness, nicho X"), tempo decorrido e fila de buscas.

Requisito importante: este agente roda com **IA de código aberto leve**, que precisa funcionar sem GPU dedicada. A IA deve ser usada principalmente para **busca, filtragem, classificação e resumo**, não para processamento pesado. Ver seção 7.

### 4.3 Agente de Publicações (sala "Publicações")

Responsável por:
- Gerenciar publicações nas redes sociais.
- Publicar Reels (Instagram/Facebook) e Shorts (YouTube), via APIs oficiais.
- Acompanhar o histórico de publicações.

Comportamento de hover (passar o mouse sobre o agente ou a sala) deve mostrar informações como:
- "Estamos há X dias sem publicações."
- "Tivemos X publicações nos últimos 3 dias."
- Última publicação realizada e em qual rede.

Estados visuais:
- **Ocioso**: personagem fora do computador.
- **Publicando**: personagem no computador, com a publicação em andamento e o status (aguardando upload, processando, publicado, erro).

Obs.: a integração com Meta e YouTube deve ser feita **aos poucos**. Nesta primeira etapa, o foco é a estrutura visual e o status. As integrações completas vêm depois, conforme o que as APIs oferecem.

---

## 5. Comportamento do personagem do usuário

- Pode andar pelo cenário com teclado (setas/WASD) ou clique para mover.
- Ao se aproximar de um agente ou de um computador, pode abrir o painel daquela sala.
- Pode ver de longe o status (ocioso ou trabalhando) de cada agente pelo próprio personagem, sem precisar entrar no painel.

---

## 6. Painel de monitoramento (o "computador")

Um painel acessível pelo computador do escritório (ou pelo clique em uma sala) deve mostrar, de forma unificada:

- **Tarefas concluídas** por agente, com data/hora e duração.
- **Tarefas em andamento**, com tempo decorrido.
- **Tarefas pendentes** (fila), na ordem de execução.
- **Tarefas com erro**, com mensagem resumida e opção de reprocessar.
- **Métricas de tempo**:
  - Tempo médio de cada tipo de tarefa por agente (ex.: tempo médio para cortar um vídeo de 10 minutos).
  - Quanto tempo leva para terminar uma tarefa de cada agente.
- **Visão geral**: quantas tarefas foram feitas hoje/na semana, por agente.

O painel deve atualizar **em tempo real** (WebSocket ou Server-Sent Events). Se for mais simples nesta fase, polling a cada poucos segundos é aceitável.

---

## 7. IA de código aberto para o agente de tendências

Requisitos:
- Código aberto.
- Roda em **CPU** (sem GPU dedicada), com consumo de memória controlado. Considere modelos pequenos e quantizados.
- Adequado para tarefas de **busca, classificação, extração de palavras-chave e resumo**.
- Não deve competir com o processamento de vídeo por recursos. Se possível, executar em processo separado ou fila de baixa prioridade.

Sugestão de abordagem (o Codex deve avaliar e propor a melhor opção, justificando):
- Usar um runtime leve para modelos locais (ex.: llama.cpp ou Ollama) com um modelo pequeno quantizado.
- Ou, se o recurso for muito limitado, usar a IA apenas para a etapa de resumo/classificação, deixando a coleta de dados por APIs oficiais e regras determinísticas.

Fontes de dados:
- Preferir **APIs oficiais** (YouTube Data API para buscas e vídeos em alta; Instagram Graph API onde houver acesso, por exemplo para hashtags).
- Respeitar os termos de uso e os limites de cota de cada plataforma. Não fazer scraping que viole os termos.
- Armazenar resultados em cache para não repetir chamadas desnecessárias.

Entrada e saída:
- Entrada: nicho ou palavras-chave definidas pelo usuário.
- Saída: relatório estruturado (JSON e visualização no painel) com tendências, tópicos, exemplos de conteúdos, score de potencial de viralização e data da análise.
- Ação "sugestões": ao clicar no agente, gerar uma lista curta de ideias de conteúdo baseadas no que está em alta.

---

## 8. Arquitetura sugerida

Essas são sugestões. O Codex pode ajustar com justificativa, mas deve manter o conceito de **agentes com estado** e **fila de tarefas**.

### 8.1 Backend

- Um modelo de **Agente** com: id, nome, sala, estado (`idle`, `working`, `waiting`, `error`), tarefa atual, timestamps.
- Um modelo de **Tarefa** com: id, agente, tipo, payload, status (`queued`, `running`, `done`, `failed`), início, fim, duração, mensagem de erro.
- Um sistema de **fila** por agente. Se a plataforma já tiver fila/worker, reutilize.
- Eventos de estado emitidos pelo backend quando um agente muda de estado ou uma tarefa muda de status, para o frontend consumir.
- Métricas calculadas a partir das tarefas concluídas (tempo médio, contagens).

### 8.2 Integração com a plataforma existente

- O agente de Edição deve chamar os serviços de legenda e corte já existentes, sem reescrever a lógica.
- O agente de Publicações deve chamar os módulos de publicação já existentes (Meta), e depois expandir para Facebook Reels e YouTube Shorts.
- O agente de Tendências é novo e deve ficar em um módulo próprio, com interface clara.

### 8.3 Frontend

- Tela principal: cenário 2D com as salas, agentes e personagem do usuário.
- Painel de monitoramento acessível pelo computador.
- Tooltips/hover nos agentes e salas.
- Componentes separados para cenário, agentes, painel e relatórios, para facilitar manutenção.

### 8.4 Recursos da VPS

- Sem GPU dedicada. Evitar qualquer dependência que exija GPU.
- Limitar concorrência dos workers para não derrubar a VPS durante processamento de vídeo.
- O cenário 2D deve ser leve. Evitar bibliotecas pesadas sem necessidade.

---

## 9. Plano de implementação sugerido (por etapas)

**Etapa 1: Base do escritório**
- Renderizar o cenário 2D com as 3 salas e o personagem do usuário andando.
- Agentes com estados `idle` e `working` (visual apenas, com dados mockados).

**Etapa 2: Estados reais**
- Ligar os agentes aos estados reais do backend (fila, tarefa atual).
- Integrar o agente de Edição aos serviços existentes de legenda e corte.

**Etapa 3: Painel de monitoramento**
- Painel com tarefas concluídas, em andamento, pendentes e erros.
- Métricas de tempo por agente e por tipo de tarefa.
- Atualização em tempo real.

**Etapa 4: Agente de Tendências**
- Módulo de busca com APIs oficiais.
- IA leve de código aberto para resumo e classificação.
- Relatório por nicho/palavras-chave e ação de sugestões.

**Etapa 5: Agente de Publicações**
- Hover com "dias sem publicar" e "publicações nos últimos 3 dias".
- Integração com a API da Meta já existente.
- Expansão para Facebook Reels e YouTube Shorts conforme as APIs permitirem.

---

## 10. Critérios de qualidade

- Código organizado e modular, com cada agente isolado.
- Nenhuma lógica de vídeo duplicada: reutilizar os serviços existentes.
- O cenário deve continuar leve e responsivo em navegador comum.
- Erros de um agente não podem derrubar os outros dois.
- Tudo que aparece na tela deve refletir o estado real do backend, nunca apenas dados fixos (exceto na Etapa 1, com mock claramente identificado).
- Documentar no código e no README as decisões técnicas importantes.

---

## 11. Pontos a confirmar com o responsável pelo projeto

Antes de implementar as partes mais específicas, confirmar:

1. Os 3 agentes ficam em **3 salas, uma cada** (interpretação adotada aqui), ou há mais de um agente por sala?
2. Quais redes sociais o agente de Tendências deve monitorar além de Instagram e YouTube (ex.: TikTok)?
3. Qual é a frequência desejada da busca de tendências (sob demanda, agendada, ou ambas)?
4. O relatório de tendências deve ser salvo por quanto tempo?
5. Qual o limite de tarefas simultâneas que a VPS aguenta sem derrubar o restante da plataforma?
6. O personagem do usuário precisa de login/autenticação própria, ou o escritório é acessado pelo mesmo login da plataforma?

---

## 12. Entrega esperada

- Código da funcionalidade integrado à plataforma existente.
- Atualização deste README (ou um README específico do módulo) com:
  - Como rodar o escritório localmente.
  - Como configurar a IA de código aberto e as chaves de API.
  - Decisões técnicas tomadas (ex.: biblioteca de renderização escolhida, modelo de IA escolhido e por quê).
  - Lista do que foi feito e do que ficou pendente por etapa.

---

## 13. Referências, fontes, ideias e dicas

> Os links abaixo são pontos de partida. Antes de adotar qualquer biblioteca, modelo ou API, confira a documentação atual, a licença e os limites de uso, porque tudo isso muda com frequência.

### 13.1 Produtos e projetos parecidos que já existem

Úteis para inspiração de layout, comportamento e arquitetura. Não é preciso copiar nada, só entender o que funciona.

- **Gather.town**: escritório virtual 2D com avatares que andam pelo mapa e interagem com salas e objetos. Referência principal de navegação e sensação de presença. (gather.town)
- **WorkAdventure**: plataforma open source de escritório/mundo virtual 2D feita com Phaser. Ótima referência de código real para cenário, mapas Tiled e multiplayer. (github.com/workadventure/workadventure)
- **AI Town (a16z)**: projeto open source de uma cidade 2D onde agentes de IA têm estado, rotina e tarefas visíveis no mapa. É a referência mais próxima do conceito de agentes "trabalhando" em um cenário. (github.com/a16z-infra/ai-town)
- **Generative Agents (Stanford, 2023)**: artigo que descreve agentes com memória, rotina e planejamento em um ambiente 2D. Útil para pensar no estado "ocioso" versus "trabalhando" e em como exibir o que cada agente está fazendo. (arxiv.org/abs/2304.03442)
- **Kumospace, Sococo, Teamflow**: escritórios virtuais comerciais. Vale observar como organizam salas, presença e o "ver quem está ocupado".
- **Ferramentas de monitoramento de agentes/filas**: Langfuse (open source, para observabilidade de IA) e o painel do BullMQ (Bull Board) como inspiração para o painel de tarefas, tempos e erros.

### 13.2 Recursos visuais (sprites, tilesets, mapas)

- **Kenney.nl**: assets gratuitos com licença CC0 (uso livre, inclusive comercial), incluindo pacotes de cidade, interiores e personagens top-down. Boa opção para começar sem custo nem problema de licença.
- **Tiled (mapeditor.org)**: editor de mapas 2D gratuito. Permite desenhar o escritório em camadas e exportar JSON, que o frontend pode carregar. Recomendado para o cenário ser editável sem mexer em código.
- **itch.io**: procure por "office tileset", "top-down interior" e "pixel office". Confira sempre a licença de cada pacote antes de usar, porque muitos são pagos ou têm restrições.
- **Dica**: prefira um único atlas de sprites e um tileset consistente. Isso mantém o visual coerente e a renderização leve na VPS.

### 13.3 Bibliotecas de renderização 2D

- **Phaser (phaser.io)**: framework de jogos 2D em JavaScript, com suporte nativo a mapas Tiled, sprites, animações e input de teclado. Boa escolha se o cenário for ter movimento de personagem e colisões.
- **PixiJS (pixijs.com)**: renderizador 2D muito leve, ótimo para desempenho. Exige mais código próprio para colisão e pathfinding, mas consome menos recursos.
- **Dica**: se o cenário for só visual com o personagem andando por pontos fixos, PixiJS basta. Se houver colisão, rotas e interações complexas, Phaser economiza tempo.

### 13.4 IA de código aberto para o agente de tendências (leve, sem GPU)

Como a VPS não tem GPU, a recomendação é usar modelos pequenos e quantizados em CPU, e reservar a IA para resumo, classificação e extração de palavras-chave.

- **Ollama (ollama.com)**: forma simples de rodar modelos locais. Pode ser usado como servidor local que o backend chama por HTTP.
- **llama.cpp (github.com/ggerganov/llama.cpp)**: runtime em C/C++ que roda modelos quantizados (GGUF) em CPU com baixo consumo. Mais controle que o Ollama, com mais trabalho de configuração.
- **Modelos pequenos candidatos** (verifique a versão mais recente e a licença de cada um):
  - Qwen2.5 nas versões 0.5B, 1.5B ou 3B, em quantização Q4 ou Q5 (licença Apache 2.0 em grande parte das versões).
  - Llama 3.2 nas versões 1B e 3B (licença própria da Meta, com restrições de uso comercial em certos casos, então leia antes).
  - Gemma 2 2B (licença própria do Google, com termos de uso).
  - Phi-3.5-mini (licença MIT).
  - SmolLM2 nas versões pequenas (Apache 2.0).
- **Dica de critério**: para resumir tendências e extrair palavras-chave, um modelo de 1B a 3B quantizado costuma ser suficiente. Teste no próprio servidor e meça tempo e memória antes de escolher.
- **Alternativa sem LLM para parte da tarefa**: para ranquear tendências, use métricas simples (crescimento de visualizações, engajamento por hora, frequência de hashtags) e deixe a IA só para descrever o resultado em linguagem natural. Isso reduz o custo drasticamente.
- **Orquestração de agentes**: se quiser usar um framework, considere LangGraph ou CrewAI, mas avalie se o overhead compensa. Para três agentes com fila simples, um módulo próprio costuma ser mais leve e mais fácil de monitorar.

### 13.5 Fontes de dados para tendências

- **YouTube Data API v3 (developers.google.com/youtube/v3)**: permite buscar vídeos por palavra-chave e obter vídeos mais populares por região. Atenção à cota diária: cada chamada consome unidades, então faça cache.
- **Instagram Graph API (developers.facebook.com/docs/instagram-platform)**: tem busca de hashtags para contas profissionais, com limite de hashtags únicas por período. Confira as permissões e revisões exigidas pela Meta.
- **Meta Content Library**: acesso para pesquisadores aprovados. Só vale se o projeto se encaixar nos critérios.
- **Google Trends** possui [API oficial em alpha](https://developers.google.com/search/apis/trends), sujeita a acesso. Fica fora da primeira integração.
- **TikTok Research API**: disponível apenas para pesquisadores aprovados. Para uso comercial, verifique a Display API e os termos atuais.
- **Dica importante**: sempre use APIs oficiais e respeite os termos. Scraping direto de redes sociais costuma violar os termos e pode bloquear sua conta ou IP.

### 13.6 Publicação (Meta e YouTube)

- **Instagram Content Publishing (Reels)**: o fluxo é em duas etapas, criar um container de mídia e depois publicá-lo. Acompanhe o status do container antes de publicar. Há limites diários de publicação.
- **Facebook Reels**: verifique a documentação de Página e de vídeos de Reels, porque os requisitos de formato e de permissão mudam.
- **YouTube Shorts**: Shorts é um vídeo vertical com até 3 minutos, enviado pela `videos.insert` da YouTube Data API. Não existe um endpoint separado para Shorts; a classificação depende do formato e da duração.
- **Dica**: monitore o status de cada publicação (enviando, processando, publicado, erro) e trate falhas com retry com espera exponencial, sem repetir o upload inteiro.

### 13.7 Arquitetura, filas e tempo real

- **BullMQ (bullmq.io)**: fila de jobs baseada em Redis, com prioridade, retry e métricas. Boa para separar os trabalhos dos três agentes e controlar concorrência na VPS.
- **Celery**: alternativa em Python, madura e bem documentada.
- **Socket.IO** ou **Server-Sent Events**: para o painel atualizar em tempo real. SSE é mais simples quando a comunicação é só do servidor para o cliente.
- **Dica de concorrência**: limite o número de jobs de vídeo rodando ao mesmo tempo (por exemplo, 1 ou 2). Assim o agente de tendências e o painel continuam responsivos mesmo durante renderização.
- **Dica de estado**: persista o estado dos agentes e das tarefas no banco. Assim o escritório reflete a realidade depois de reiniciar o servidor.

### 13.8 Ideias extras para o escritório

- **Dia da semana**: o escritório pode mudar de cenário conforme o horário (luz mais clara de dia, mais escura à noite), sem custo de processamento.
- **Mural de tendências**: um quadro na sala de Tendências com as três palavras-chave mais fortes da semana.
- **Caixa de entrada do usuário**: uma mesa do personagem onde aparecem notificações quando uma tarefa termina ou dá erro.
- **Linha do tempo**: um painel que mostra o histórico do dia, com cada tarefa aparecendo como um bloco de tempo, parecido com um Gantt simples.
- **Estimativa de término**: usar a média de duração das tarefas anteriores do mesmo tipo para estimar quando a fila termina.
- **Sons leves e opcionais**: um aviso sonoro quando uma publicação for concluída, desligado por padrão.
- **Modo de foco**: clicar em um agente e ver apenas a sala dele, escondendo o resto do cenário.

### 13.9 Dicas gerais para trabalhar com o Codex

- Peça para o Codex **começar pelo mapeamento do código existente** e apresentar um resumo antes de alterar qualquer coisa.
- Divida o trabalho por etapas (seção 9) e peça um commit por etapa, para facilitar revisão e reversão.
- Peça **testes** para a máquina de estados dos agentes (ocioso, trabalhando, esperando, erro) e para o cálculo de métricas de tempo.
- Peça que o cenário use **dados mockados identificados** na Etapa 1, para o visual ser validado antes da integração real.
- Peça um **arquivo de configuração** para as chaves de API, sem nenhuma chave escrita no código.
- Peça que cada decisão técnica relevante (biblioteca, modelo de IA, fila) seja registrada no README com justificativa.

## Decisões aprovadas e entrega da Etapa 1

Acesse `/escritorio` pelo menu. Para rodar localmente, na raiz do projeto execute `npm install` e `npm run dev`. Abra `http://localhost:3000/escritorio`. A demonstração roda no navegador sem chaves, GPU ou worker. Setas/WASD movem o avatar com o mapa em foco. Clique ou toque no chão para caminhar, em um agente para filtrar a sala e no computador central para ver todos. Os monitores e os nomes dos agentes são controles acessíveis por teclado. O computador central abre uma janela sobreposta com o resumo das três salas. No telefone, deslize para explorar o cenário. Use a seta no canto para voltar ao Studio.

Canvas 2D desenha um mapa em JSON com colisão e um atlas de personagens em pixels. O cenário redesenha quando a posição, o foco ou a seleção mudam. Três salas têm um agente cada. O quarto personagem representa o usuário. Todos os estados e tarefas da Etapa 1 são ilustrativos.

- Etapa 2: integrar a fila de edição existente e testar estados. Combinar tarefa e sinal periódico de atividade do worker. Serviço sem integração aparece como “Ainda não configurado”. Ocioso significa disponível e sem trabalho.
- Etapa 3: painel e testes de métricas. Eventos servidor → navegador com recuperação após reconexão. Medir espera separadamente de execução.
- Antes da Etapa 4: apresentar medições reais de CPU, RAM e tempo de inferência na VPS para cada candidato antes de escolher modelo. Um job pesado de vídeo por vez, com orçamento de CPU compartilhado com avaliação de público e inferência de tendências.
- Etapa 4: buscas sob demanda pelo YouTube primeiro. Instagram somente com acesso oficial da conta profissional confirmado. Cache por nicho e palavras-chave. Relatórios por 30 dias, separados da retenção das prévias. Documentar modelo, configuração e chaves por ambiente quando definidos.
- Etapa 5: “Publicações pelo Studio” conta publicações confirmadas nas últimas 72 horas por conta e rede; novas tentativas não duplicam contagem. Exibir “Nenhuma publicação registrada” sem dados. Utilizar a proteção existente, sem login do avatar. Antes de liberar publicação ou reprocessamento, verificar a proteção efetiva das rotas na VPS, informar o responsável e obter confirmação.

Cada etapa exige commit próprio e aprovação antes da seguinte.

A HUD da demonstração compartilha as contagens com a Central. Hoje e Esta semana incluem fila, execução e conclusões. Publicações usa sempre a janela de 72 horas. Os exemplos ficam em map.json. A estimativa aguarda histórico real na integração de backend. O cenário usa mobiliário em pixel art próprio e respeita a preferência de movimento reduzido.

A versão visual aprovada usa Office Pixel Art Free da Imersa Studios (ver CREDITS.md). O navegador lê o mapa Tiled public/office/office.tmj e os quatro atlas PNG. O tile mede 32 px e a altura visual de referência do personagem em pé é 48 px antes do zoom inteiro de 2× a 4×. A área de colisão acompanha os pés do personagem.

### Etapa 2 — sala de Edição e fila real

A sala Edição compartilha o formulário de criação e os serviços de upload, importação e geração de cortes do Studio. O resultado abre no próprio escritório. O link de revisão leva ao projeto no Studio. A Central sinaliza prévias disponíveis para revisão e exportações finalizadas cujo arquivo existe.

Para rodar localmente, inicie o site com `npm run dev` e, em outro terminal na raiz do mesmo projeto, ative o ambiente Python do Studio e execute `python -m studio.worker work`. Abra `/escritorio`. Site e worker precisam compartilhar o diretório storage. A atualização desta etapa é por consulta a cada cinco segundos. O worker registra atividade a cada dez segundos. O escritório considera o worker disponível quando o processo detém o bloqueio e o sinal tem menos de 45 segundos.

O progresso sobre Lia é uma estimativa da tarefa em execução. O cálculo usa a mediana dos últimos vinte trabalhos concluídos do mesmo tipo, ajustada pela duração da mídia quando disponível. Para a primeira análise ou renderização, usa a duração do vídeo ou corte. Durante uma importação sem referência de tempo, a barra indica atividade até haver uma estimativa. A avaliação de público e os jobs de vídeo compartilham um bloqueio exclusivo de CPU na VPS.

Tendências e Publicações aguardam as respectivas integrações. O painel histórico detalhado e a transmissão de eventos ficam para a Etapa 3. A proteção de produção por proxy ou sessão ainda requer confirmação antes de habilitar publicação ou reprocessamento pelo escritório. Esta etapa utiliza as configurações existentes do Studio e dispensa novas chaves.

### Medição antes de ativar Tendências

O orçamento de execução de um relatório pode chegar a cinco horas. A prioridade é preservar CPU e memória para vídeos. Caio pode pesquisar durante uma edição. Há uma pesquisa por vez, com prioridade de CPU reduzida e uma thread de inferência. As cadências consideradas são diária, a cada três dias ou semanal. A periodicidade definitiva depende da configuração do departamento.

Na VPS Linux, com o Ollama local iniciado, rode o ensaio a partir da raiz do projeto. Os dois modelos abaixo são candidatos para comparação. Instale-os apenas se ainda não estiverem disponíveis.

```bash
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:1.5b
python3 -m studio.benchmark_trends qwen2.5:0.5b qwen2.5:1.5b
```

O ensaio usa CPU, uma thread e o mesmo exemplo de tendência para ambos. Ele mede tempo total, tempo de geração, CPU média (100% representa um núcleo) e pico de memória RSS dos processos Ollama, amostrado a cada 250 ms. Rode sem outras requisições ao Ollama. A resposta também é registrada para revisão. O exemplo verifica se o modelo distingue variação observada de um único ponto de dados. A escolha do modelo e o agendamento aguardam as medições da VPS.

### Pesquisas no departamento de Tendências

No escritório, clique em Caio e em **Pesquisar tendências**. O YouTube pesquisa vídeos publicados no período e disponíveis na região selecionada. A Twitch pesquisa canais ao vivo no momento da consulta. Os links e nomes vêm das APIs oficiais. Os resultados ficam visíveis enquanto o modelo local prepara a análise.

Na raiz do Studio, configure no arquivo .env ou no ambiente do serviço YOUTUBE_API_KEY (YouTube Data API v3), TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET (aplicativo Twitch Helix), conforme as fontes desejadas. Configure STUDIO_TRENDS_MODEL com o identificador instalado no Ollama local depois da medição. O worker usa o serviço em 127.0.0.1:11434 com uma thread de CPU. Inicie o worker normal do Studio. Consultas iguais reutilizam o resultado do YouTube por 24 horas e o de lives por 15 minutos. Os relatórios expiram em 30 dias. A fila de tendências é independente da edição. Na VPS, o serviço Ollama também deve receber prioridade de CPU menor que o worker de vídeo.
