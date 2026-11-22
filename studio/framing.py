"""Estimate horizontal framing from face positions and lower-face motion."""
import math


def crop_x(source, start, end):
    import cv2
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    capture = cv2.VideoCapture(str(source))
    previous = []
    center = 0.5
    points = []
    try:
        for second in range(math.ceil(end-start)):
            capture.set(cv2.CAP_PROP_POS_MSEC, 1000*(start+second))
            ok, frame = capture.read()
            if not ok:
                break
            gray = cv2.cvtColor(cv2.resize(frame,(480, max(64,round(480*frame.shape[0]/frame.shape[1])))),cv2.COLOR_BGR2GRAY)
            faces = detector.detectMultiScale(gray,1.1,5,minSize=(24,24))
            current = []
            for x,y,w,h in faces:
                pos = (x+w/2)/480
                mouth = cv2.resize(gray[y+2*h//3:y+h,x+w//4:x+3*w//4],(24,12))
                match = min(previous,key=lambda item:abs(item[0]-pos),default=None)
                motion = cv2.absdiff(mouth,match[1]).mean() if match and abs(match[0]-pos)<0.12 else 0
                current.append((pos,mouth,motion))
            if current:
                target = max(current,key=lambda item:item[2]-10*abs(item[0]-center))[0]
            else:
                target = 0.5
            previous = current
            points.append(center)
            center += 0.5*(target-center)
    finally:
        capture.release()
    points.append(center)
    # Piecewise linear interpolation between the one-second samples.
    terms = [str(round(points[0],4))]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        terms.append(f"{b-a:.4f}*clip(t-{i},0,1)")
    return "'clip(iw*("+ "+".join(terms)+")-ow/2,0,iw-ow)'"
