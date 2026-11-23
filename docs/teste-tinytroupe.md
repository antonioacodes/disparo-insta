# Testar um corte com TinyTroupe

Na raiz do projeto, instale o SDK em um ambiente separado do Whisper. Use Python 3.12, Git e FFmpeg. O SDK usa a API da OpenAI por padrão. O teste envia três quadros da prévia e a transcrição do corte ao provedor e gera chamadas cobradas por uso.

```bash
python3.12 -m venv /home/acodes-painel/tinytroupe-env
export TINYTROUPE_PYTHON=/home/acodes-painel/tinytroupe-env/bin/python
"$TINYTROUPE_PYTHON" -m pip install -r studio/requirements-audience.txt
"$TINYTROUPE_PYTHON" -c 'from tinytroupe.agent import TinyPerson'
read -rsp 'Chave da API OpenAI: ' OPENAI_API_KEY
echo
export OPENAI_API_KEY
export STUDIO_AUDIENCE_PROVIDER=tinytroupe
```

Para listar IDs e títulos legíveis e escolher um corte cuja prévia já abre no Studio:

```bash
python3 -c 'from studio.worker import db; print(*(tuple(r) for r in db.execute("SELECT id,title FROM clips WHERE state <> ?", ("detected",))),sep="\n")'
read -rp 'ID do corte: ' CLIP_ID
python3 -m studio.worker audience "$CLIP_ID"
```

Reabra o projeto e expanda a nota com o nome TinyTroupe. Repetir o comando substitui a avaliação daquela versão. Para avaliar continuamente, configure as três variáveis exportadas acima no ambiente persistente do processo que executa `python3 -m studio.worker work` e reinicie esse worker. Ao ativar esse modo ele também processa o acervo de prévias com avaliação antiga ou ausente. Para testar apenas um clipe, basta executar o comando com ID.

A avaliação acompanha cada versão em Studio e em Escritório → Edição → Vídeos prontos. Uma falha transitória volta à fila com espera progressiva, até três tentativas automáticas. O comando por ID permite repetir uma avaliação após corrigir o ambiente. Quando o provedor estiver desligado ou o worker estiver offline, o painel mostra esse estado. Reinicie o worker com o ambiente configurado para processar prévias existentes e futuras.

Um job de edição na fila ou em execução tem prioridade. O supervisor local verifica a fila a cada meio segundo e interrompe o grupo de processos de avaliação se chegar uma edição. Essa interrupção não consome uma tentativa. Os pareceres TinyTroupe concluídos ficam salvos por versão e são reaproveitados na retomada. Uma chamada já recebida pelo provedor externo pode ser cobrada, mesmo que o cliente local seja interrompido.
