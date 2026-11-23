"""Generate ASS events from Whisper word times, clipped to visible caption spans."""


def escape(text):
    return text.replace("\\", "＼").replace("{", "｛").replace("}", "｝")


def karaoke_events(segment, left, right, origin, color):
    tokens = [escape(token) for token in segment["text"].split()]
    if not tokens:
        return
    words = segment.get("words", [])
    if len(words) == len(tokens) and all("start" in w and "end" in w for w in words):
        times = [(w["start"], w["end"]) for w in words]
    else:
        # Older transcripts and revisions may have different token counts.
        step = (segment["end"] - segment["start"]) / len(tokens)
        times = [(segment["start"] + i*step, segment["start"] + (i+1)*step)
                 for i in range(len(tokens))]
    bgr = color[5:7] + color[3:5] + color[1:3]
    cursor = left
    plain = " ".join(tokens)
    for index, (start, end) in enumerate(times):
        start, end = max(start, cursor), min(end, right)
        if end <= start:
            continue
        if start > cursor:
            yield cursor-origin, start-origin, plain
        grow = max(1, min(100, round((end-start)*500)))
        active = tokens.copy()
        active[index] = (r"{\1c&H" + bgr + r"&\fscx105\fscy105\t(0,"
                         + str(grow) + r",\fscx118\fscy118)}" + tokens[index]
                         + r"{\1c&HFFFFFF&\fscx100\fscy100}")
        yield start-origin, end-origin, " ".join(active)
        cursor = end
    if cursor < right:
        yield cursor-origin, right-origin, plain
