"""Project editing presets for vertical studio renders."""
import array
import math
import re
import shutil
import subprocess

def run(args, data=None):
    return subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=180).stdout

def captions_visible(source,start,end):
    if not shutil.which("tesseract"):
        raise ValueError("Detecção automática exige Tesseract. Instale tesseract-ocr ou escolha preservar as legendas.")
    hits = 0
    for fraction in (.15,.35,.6,.85):
        frame = run(["ffmpeg","-loglevel","error","-ss",str(start+(end-start)*fraction),"-i",str(source),"-frames:v","1","-vf","crop=iw:ih*0.55:0:ih*0.45,scale=960:-2","-f","image2pipe","-c:v","png","-"])
        words = run(["tesseract","stdin","stdout","--psm","6"],frame).decode(errors="replace")
        hits += len(re.findall(r"[^\W\d_]{2,}",words)) >= 3
    return hits >= 2

def face_region(source,start,end):
    import cv2
    cap=cv2.VideoCapture(str(source))
    try:
        detect=cv2.CascadeClassifier(cv2.data.haarcascades+"haarcascade_frontalface_default.xml")
        tracks=[]
        for i in range(8):
            cap.set(cv2.CAP_PROP_POS_MSEC,(start+(end-start)*(i+.5)/8)*1000)
            ok,frame=cap.read()
            if not ok: continue
            height,width=frame.shape[:2]
            gray=cv2.cvtColor(cv2.resize(frame,(640,round(height*640/width))),cv2.COLOR_BGR2GRAY)
            for x,y,w,h in detect.detectMultiScale(gray,1.1,5,minSize=(22,22)):
                if w>210: continue
                center=((x+w/2)/640,(y+h/2)/gray.shape[0])
                if .3<center[0]<.7 and .3<center[1]<.7: continue
                track=next((t for t in tracks if abs(t[0][0]-center[0])<.07 and abs(t[0][1]-center[1])<.09),None)
                if track is None:
                    track=[]; tracks.append(track)
                track.append((*center,w/640,i))
        stable=[t for t in tracks if len({v[3] for v in t})>=4]
        if not stable: return None
        best=max(stable,key=len)
        cx,cy,fw=[sum(v[j] for v in best)/len(best) for j in range(3)]
        side=int(min(width,height,fw*width*2.4))//2*2
        return side,max(0,min(width-side,int(cx*width-side/2))),max(0,min(height-side,int(cy*height-side*.45)))
    finally:
        cap.release()

def peaks(source,start,end):
    pcm=array.array("h")
    pcm.frombytes(run(["ffmpeg","-loglevel","error","-ss",str(start),"-i",str(source),"-t",str(end-start),"-vn","-ac","1","-ar","8000","-f","s16le","-"]))
    levels=[math.sqrt(sum(x*x for x in pcm[i:i+8000])/len(pcm[i:i+8000])) for i in range(0,len(pcm),8000)]
    if not levels: return "0"
    threshold=max(300,sorted(levels)[int(.75*(len(levels)-1))],sum(levels)/len(levels)*1.2)
    return "+".join(f"between(t,{i},{i+1})" for i,v in enumerate(levels) if v>=threshold) or "0"
