# Configurar o departamento de Roteiros

Execute os comandos na raiz do Studio, com o usuário do worker. O escritório consulta o histórico ao abrir. A geração começa quando um operador escolhe **Gerar roteiro**.

| Variável | Uso |
|---|---|
| OLLAMA_URL | Endereço local do Ollama, normalmente http://127.0.0.1:11434 |
| ROTEIRO_MODELO | Tag do modelo validado na VPS |
| OLLAMA_KEEP_ALIVE | Configuração do serviço Ollama. Os jobs de roteiro solicitam descarregamento imediato |
| PEXELS_API_KEY | Chave fornecida pelo Pexels para buscar imagens de apoio em vídeo |
| PIPER_MODEL_PATH | Caminho absoluto do arquivo ONNX pt_BR com o JSON de configuração ao lado |
| FFMPEG_THREADS | Threads de codificação, inicialmente duas |
| DIRETORIO_PRODUCAO | Diretório gravável para mídia, cache e intermediários |
| ESPACO_MINIMO_GB | Reserva mínima de espaço livre para permitir o início de cada etapa |

Preencha as variáveis da aplicação em .env.local na VPS. Configure o Ollama como serviço local, com OLLAMA_MAX_LOADED_MODELS=1 e OLLAMA_NUM_PARALLEL=1. Use os resultados da VPS antes de definir ROTEIRO_MODELO. Consulte [recursos](docs/recursos_vps.md) e [modelos](docs/modelos.md).

## Testar os provedores

Baixe e compare os modelos em sequência.

~~~sh
ollama pull qwen2.5:7b
ollama pull mistral:7b-instruct-v0.3-q4_K_M
python3 -m studio.benchmark_roteiros qwen2.5:7b
python3 -m studio.benchmark_roteiros mistral:7b-instruct-v0.3-q4_K_M
~~~

Instale piper-tts em um ambiente Python isolado. Coloque o executável piper no PATH do worker. Baixe pt_BR-edresson-low.onnx e o arquivo .onnx.json do mesmo diretório. Guarde também o MODEL_CARD junto à voz. [Voz em português](https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/edresson/low)

~~~sh
echo 'Uma janela aberta para a manhã.' | piper --model "$PIPER_MODEL_PATH" --output_file /tmp/voz-studio.wav
ffprobe -v error -show_entries format=duration /tmp/voz-studio.wav
ffmpeg -hide_banner -filters | grep subtitles
~~~

Para testar o Pexels com a configuração do Studio, a consulta abaixo consome uma requisição e mostra apenas a resposta HTTP.

~~~sh
python3 -c "from studio.roteiros import config; from urllib.request import Request,urlopen; print(urlopen(Request('https://api.pexels.com/v1/videos/search?query=park&per_page=1',headers={'Authorization':config()['PEXELS_API_KEY']}),timeout=30).status)"
~~~

## Conferir as aprovações

Crie um briefing e gere o roteiro. A produção fica disponível depois de revisar a narração e aprovar explicitamente a versão. No vídeo, confira o áudio, as legendas e os créditos. A aprovação final disponibiliza o item em Publicações para conferência. O botão de publicação permanece desabilitado. Os testes usam uma base temporária e dispensam credenciais.

~~~sh
python3 -m unittest discover -s tests
~~~

### Mídia e som ambiente da Bia

No arquivo de ambiente do Studio, cada provedor aceita uma chave ou várias separadas por vírgula. A ordem indica preferência. Uma chave inválida permite tentar a próxima. O limite de cota do provedor continua valendo.

```dotenv
PIXABAY_API_KEY=
PEXELS_API_KEY=
FREESOUND_API_KEY=
MIXKIT_CATALOG=
AMBIENCIA=on
```

A produção aprovada procura cenas no catálogo local do Mixkit, Pixabay, Pexels e Wikimedia Commons. No Commons são selecionados apenas arquivos identificados como CC0 ou domínio público. Sem cena compatível, a montagem usa o fundo sólido. Origem e autor aparecem na revisão.

Para Mixkit, baixe os vídeos com **Stock Video Free License** e coloque-os junto de um catálogo JSON. Aponte MIXKIT_CATALOG para o caminho absoluto do JSON. Exemplo de estrutura (substitua a URL pela página real do clipe):

```json
[{"file":"chuva.mp4","tags":["rain","city","street"],"license":"Free License","author":"Nome do autor","url":"https://mixkit.co/..."}]
```

Com AMBIENCIA=on, cada cena pode receber um som ambiente sugerido pelo roteiro, abaixo da narração. Com AMBIENCIA=off o vídeo usa apenas narração. O Commons funciona sem chave. Se configurar Freesound, a busca prioriza prévias de sons CC0 desse provedor. Para projetos monetizados, confirme a licença comercial da API com o Freesound antes de configurar a chave. Sem resultado compatível, a cena mantém a voz sozinha.

Documentação: [Pixabay](https://pixabay.com/api/docs/), [Mixkit](https://mixkit.co/license/), [Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [Freesound](https://freesound.org/docs/api/terms_of_use.html).


### Supervisor Gemini

Configure no ambiente do servidor:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Separe chaves por vírgula, na ordem de preferência. O serviço tenta a próxima se a credencial for inválida. Em caso de cota esgotada ou indisponibilidade, a revisão fica pendente de retomada. Sem chave, continua o fluxo local. Ao configurar, os novos roteiros, relatórios com análise, prévias e vídeos renderizados são enviados ao Google para revisão. O MP4 é enviado com áudio e o serviço solicita a exclusão da cópia remota após o parecer. A revisão editorial humana continua necessária para a publicação.
