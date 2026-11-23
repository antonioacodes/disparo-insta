"""Place short editorial accents at speech resumptions in the clip timeline."""


def accents(segments, start, end):
    beats = []
    previous_end = start
    for segment in segments:
        at = segment["start"] - start
        if (segment["text"].strip() and segment["start"] - previous_end >= .45
                and 1 <= at <= end - start - 1 and (not beats or at - beats[-1] >= 8)):
            beats.append(at)
            if len(beats) == 3:
                break
        previous_end = max(previous_end, segment["end"])
    return beats


def motion_filters(filters, beats, width, height, sound):
    # Composite before camera and captions so both stay fixed and legible.
    active = "+".join(f"between(t,{at:.3f},{at + .85:.3f})" for at in beats)
    filters = filters.replace("[base];", "[picture];")
    filters += (f"[picture]split[normal][detail];[detail]crop=iw*0.94:ih*0.94,"
                f"scale={width}:{height},setsar=1[closer];"
                f"[normal][closer]overlay=0:0:enable='{active}'[base];")
    if not sound:
        return filters, "0:a:0?"
    tones = []
    for at in beats:
        elapsed = f"(t-{at:.3f})"
        tones.append(f"if(between({elapsed},0,0.12),0.03*sin(2*PI*540*{elapsed})"
                     f"*sin(PI*{elapsed}/0.12)^2,0)")
    filters += "[0:a:0]aeval='val(ch)+" + "+".join(tones) + "':c=same[mixed];"
    return filters, "[mixed]"
