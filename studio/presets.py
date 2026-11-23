"""Project editing presets for vertical studio renders."""
import array
import math
import re
import shutil
import subprocess

def run(args, data=None):
    return subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=180).stdout

def missing_caption_spans(source,start,end,horizontal=False):
    ratio = "16/9" if horizontal else "9/16"
    if not shutil.which("tesseract"):
        raise ValueError("Detecção automática exige Tesseract. Instale tesseract-ocr ou escolha preservar as legendas.")
    spans = []
    left = start
    while left < end:
        right = min(end,left+.5)
        frame = run(["ffmpeg","-loglevel","error","-ss",str((left+right)/2),"-i",str(source),"-frames:v","1","-vf",f"crop=min(iw\\,ih*{ratio}):min(ih\\,iw/({ratio})),crop=iw:ih*0.38:0:ih*0.60,scale=640:-2","-f","image2pipe","-c:v","png","-"])
        words = run(["tesseract","stdin","stdout","--psm","6"],frame).decode(errors="replace")
        if len(re.findall(r"\b[^\W\d_]{2,}\b", words)) < 2:
            if spans and spans[-1][1] == left:
                spans[-1] = (spans[-1][0],right)
            else:
                spans.append((left,right))
        left = right
    return spans

def camera_bounds(frames, cx, cy, size):
    """Find persistent panel edges around the tracked face, in sample coordinates."""
    import numpy as np
    def bounds(samples, center, cross, radius):
        # Score each edge by its contrast across the face and across multiple frames.
        lo = max(0, round(cross-size*.38))
        hi = min(samples.shape[1], round(cross+size*.38)+1)
        contrasts = np.abs(np.diff(samples[:,lo:hi,:].astype("int16"),axis=2))
        scores = np.median(contrasts,axis=(0,1))
        limit = samples.shape[2]
        def edge(direction):
            positions = np.arange(round(center+direction*size*.55),
                                  round(center+direction*size*radius),direction)
            positions = positions[(positions>=1)&(positions<limit)]
            if len(positions):
                peak = positions[np.argmax(scores[positions-1])]
                if scores[peak-1]>=14:
                    return peak-direction
            return None
        return edge(-1),edge(1)
    samples = np.stack(frames)
    left,right = bounds(samples,cx,cy,2.6)
    top,bottom = bounds(samples.transpose(0,2,1),cy,cx,2.1)
    # Where an edge blends into the scene, stay close to the detected face.
    h,w = samples.shape[1:]
    return (max(0,left if left is not None else round(cx-size*.64)),
            max(0,top if top is not None else round(cy-size*.70)),
            min(w,right if right is not None else round(cx+size*.64)),
            min(h,bottom if bottom is not None else round(cy+size*.52)))


def face_region(source,start,end):
    import cv2
    cap=cv2.VideoCapture(str(source))
    try:
        detect=cv2.CascadeClassifier(cv2.data.haarcascades+"haarcascade_frontalface_default.xml")
        tracks=[]
        frames={}
        for i in range(8):
            cap.set(cv2.CAP_PROP_POS_MSEC,(start+(end-start)*(i+.5)/8)*1000)
            ok,frame=cap.read()
            if not ok: continue
            height,width=frame.shape[:2]
            gray=cv2.cvtColor(cv2.resize(frame,(640,round(height*640/width))),cv2.COLOR_BGR2GRAY)
            frames[i]=gray
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
        sampled=[frames[i] for i in sorted({v[3] for v in best})]
        sh,sw=sampled[0].shape
        l,t,r,b=camera_bounds(sampled,cx*sw,cy*sh,fw*sw)
        x,y=math.ceil(l*width/sw/2)*2,math.ceil(t*height/sh/2)*2
        cw,ch=int(r*width/sw/2)*2-x,int(b*height/sh/2)*2-y
        return (cw,ch,x,y) if min(cw,ch)>=2 else None
    finally:
        cap.release()

def peaks(source,start,end):
    pcm=array.array("h")
    pcm.frombytes(run(["ffmpeg","-loglevel","error","-ss",str(start),"-i",str(source),"-t",str(end-start),"-vn","-ac","1","-ar","8000","-f","s16le","-"]))
    levels=[math.sqrt(sum(x*x for x in pcm[i:i+8000])/len(pcm[i:i+8000])) for i in range(0,len(pcm),8000)]
    if not levels: return "0"
    threshold=max(300,sorted(levels)[int(.75*(len(levels)-1))],sum(levels)/len(levels)*1.2)
    return "+".join(f"between(t,{i},{i+1})" for i,v in enumerate(levels) if v>=threshold) or "0"
