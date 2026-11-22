"""Import an archived platform video or a direct HTTPS media file."""
import ipaddress
import os
import re
import socket
import shutil
import subprocess
from urllib.parse import parse_qs, urljoin, urlsplit


def source_url(url):
    u = urlsplit(url)
    if (u.scheme != "https" or not u.hostname or u.username or u.password or
            u.port not in (None, 443) or any(ord(c) < 33 or c == "\\" for c in url)):
        raise ValueError("Use um link HTTPS público para um vídeo.")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+",u.hostname):
        raise ValueError("Nome de domínio inválido.")
    host = u.hostname.removeprefix("www.")
    if host in ("youtube.com", "m.youtube.com", "youtu.be"):
        video = (parse_qs(u.query).get("v", [""])[0] if u.path == "/watch"
                 else u.path.split("/")[-1])
        if re.fullmatch(r"[\w-]{11}", video, re.ASCII):
            return "Youtube", "https://www.youtube.com/watch?v=" + video
    elif host == "twitch.tv":
        if re.fullmatch(r"/videos/[0-9]+/?", u.path):
            return "TwitchVod", "https://www.twitch.tv" + u.path
    elif host == "kick.com":
        if re.fullmatch(r"/[\w-]+/videos/[0-9a-fA-F-]{36}/?", u.path):
            return "KickVOD", "https://kick.com" + u.path
    else:
        return None, url
    raise ValueError("Informe o link de um vídeo ou VOD específico.")


def direct(url, path):
    for _ in range(6):
        source_url(url)
        host = urlsplit(url).hostname
        addresses = [ipaddress.ip_address(a[4][0]) for a in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)]
        if not addresses or any(not a.is_global or a.is_multicast for a in addresses):
            raise ValueError("O endereço precisa ser público.")
        addr = str(addresses[0])
        if ":" in addr:
            addr = "[" + addr + "]"
        response = subprocess.run(["curl","-q","--silent","--show-error","--globoff","--noproxy","*",
            "--proto","=https","--resolve",f"{host}:443:{addr}","--max-time","3600",
            "--max-filesize",str(8*1024**3),"--output",str(path),"--write-out",
            "%{http_code} %{redirect_url}","--",url],capture_output=True,text=True,timeout=3610)
        status, _, location = response.stdout.partition(" ")
        if response.returncode == 0 and status == "200":
            return
        if status in ("301","302","303","307","308") and location:
            url = urljoin(url,location)
            continue
        raise ValueError("Falha ao baixar o arquivo. Confira acesso, tamanho e validade do link.")
    raise ValueError("Redirecionamentos demais no link de origem.")


def download(url, folder, output):
    extractor, url = source_url(url)
    folder.mkdir(parents=True,exist_ok=True)
    if extractor:
        args = [os.getenv("YT_DLP_BIN","yt-dlp"),"--ignore-config","--no-playlist","--no-progress",
                "--match-filter","!is_live","-f","bv*+ba/b",
                "--merge-output-format","mkv","-o",str(folder/"source.%(ext)s"),"--",url]
        node = shutil.which("node")
        if node:
            args[1:1] = ["--js-runtimes","node:"+node]
        result = subprocess.run(args, capture_output=True,timeout=7200)
        candidates = [p for p in folder.glob("source.*") if p.suffix in (".mp4",".mkv",".webm",".mov",".flv")]
        if result.returncode or len(candidates)!=1:
            raise ValueError("O provedor não entregou o vídeo. Confira o link, a disponibilidade da VOD e a versão do yt-dlp.")
        source = candidates[0]
    else:
        source = folder/"remote"
        direct(url,source)
    # Restrict local input to self-contained containers. Stream copy preserves source quality.
    result = subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-protocol_whitelist","file",
        "-format_whitelist","mov,matroska,webm,avi,mpegts,flv,mpeg","-i",str(source),
        "-map","0:v:0","-map","0:a:0?","-c","copy","-f","matroska",str(output)],capture_output=True,timeout=7200)
    if result.returncode:
        raise ValueError("O link não forneceu um arquivo de vídeo compatível.")
