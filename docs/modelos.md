# Candidatos para Roteiros

O teste usa o mesmo briefing de um minuto em português brasileiro para os dois candidatos, com duas threads de CPU, contexto de 2048 tokens e descarregamento após cada resposta. O bloqueio de vídeo e o bloqueio de inferência são adquiridos nessa ordem. Buscar links dispensa ambos.

| Candidato | Quantização | Tamanho no catálogo | Licença |
|---|---|---|---|
| [Qwen2.5 7B](https://ollama.com/library/qwen2.5:7b) | Q4_K_M | 4,7 GB | Apache 2.0 |
| [Mistral 7B Instruct v0.3](https://ollama.com/library/mistral:7b-instruct-v0.3-q4_K_M) | Q4_K_M | 4,4 GB | Apache 2.0 |

Execute na raiz do Studio com `python3 -m studio.benchmark_roteiros TAG`. O resultado inclui tempo total, CPU, pico da soma das memórias residentes dos processos Ollama, swap do sistema e resposta integral. Avalie o português, a estrutura das cenas e as marcações de verificação. O teto de aceitação é 6.500.000.000 bytes de memória residente.

### Primeira execução na Contabo

O Qwen terminou a primeira amostra em 271,89 segundos e devolveu cinco cenas. A narração ficou abaixo do alvo de 130 palavras. A frase sobre uma caminhada de cinco quilômetros veio sem fonte e sem sinalização. A revisão humana precisa conferir tanto a duração quanto os fatos.

A primeira leitura de memória considerava apenas processos com nome iniciado por ollama. Na VPS, o processo de inferência se chama llama-server. O medidor corrigido inclui todos os processos do grupo do serviço. O pico histórico do grupo, 5.287.677.952 bytes na consulta, abrange mais de uma execução e não serve para aprovar um candidato individualmente. A escolha permanece pendente dos resultados individuais corrigidos.
