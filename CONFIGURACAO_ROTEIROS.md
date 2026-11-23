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
