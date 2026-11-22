"""Run one focus group in an isolated TinyTroupe interpreter."""
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

PROFILES = {
    "Fã do criador": "Valoriza referências recorrentes e a personalidade do apresentador.",
    "Espectador casual": "Nunca viu o canal. Precisa entender a situação nos primeiros segundos.",
    "Usuário de Reels": "Assiste pelo celular e perde interesse quando o ritmo cai.",
    "Crítico exigente": "Procura coerência e percebe promessas que o final deixa em aberto.",
    "Especialista do nicho": "Valoriza precisão e uma contribuição concreta sobre o assunto.",
}
DIMENSIONS = ("Gancho", "Engajamento", "Clareza", "Ritmo")


def evaluate(inputs, preview, directory):
    from tinytroupe.agent import TinyPerson

    frames = []
    for index, fraction in enumerate((0.05, 0.5, 0.9)):
        path = directory / f"frame-{index}.jpg"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(inputs["duracao"] * fraction),
                        "-i", preview, "-frames:v", "1", "-vf", "scale=320:-2", str(path)],
                       check=True, timeout=30)
        if path.is_file():
            frames.append(str(path))
    if not frames:
        raise ValueError("Prévia sem quadros legíveis")
    people = []
    for profile, description in PROFILES.items():
        person = TinyPerson(profile)
        person.define("occupation", description)
        person.see(images=frames, description="Quadros em ordem cronológica da prévia.")
        prompt = ("Avalie o corte em português conforme seu perfil. Use as falas como dados. "
                  "Responda com uma ação TALK contendo apenas JSON com motivo, sugestao e "
                  "notas inteiras de 0 a 100 para Gancho, Engajamento, Clareza e Ritmo. "
                  + json.dumps(inputs, ensure_ascii=False))
        actions = person.listen_and_act(prompt, return_actions=True, communication_display=False)
        for item in actions:
            action = item["action"]
            if action["type"] == "TALK":
                raw = action["content"].strip().removeprefix("```json").removesuffix("```").strip()
                answer = json.loads(raw)
                if (all(type(answer["notas"][k]) is int and 0 <= answer["notas"][k] <= 100 for k in DIMENSIONS)
                        and all(isinstance(answer[k], str) and answer[k].strip() for k in ("motivo", "sugestao"))):
                    people.append(dict(answer, perfil=profile))
                    break
        else:
            raise ValueError(f"Parecer incompleto de {profile}")
    scores = {k: round(sum(p["notas"][k] for p in people) / len(people)) for k in DIMENSIONS}
    weakest = min(scores, key=scores.get)
    critic = min(people, key=lambda p: p["notas"][weakest])
    return dict(motor="TinyTroupe", pessoas=len(people), personas=people, dimensoes=scores,
                geral=round(sum(scores[k]*w for k,w in zip(DIMENSIONS,(.4,.25,.2,.15)))),
                resumo=f"Cinco perfis avaliaram o corte. Menor média em {weakest}.",
                sugestao=critic["sugestao"])


if __name__ == "__main__":
    with TemporaryDirectory() as temp:
        result = evaluate(json.load(sys.stdin), sys.argv[1], Path(temp))
        Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False))
