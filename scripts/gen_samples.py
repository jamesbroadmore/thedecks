import math
import os
import struct
import wave

OUT = "/app/sample-music"
os.makedirs(OUT, exist_ok=True)

SR = 44100

def tone(name, seconds, freqs, artist):
    path = os.path.join(OUT, name)
    n = int(SR * seconds)
    with wave.open(path, "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i in range(n):
            t = i / SR
            # blend a couple of frequencies + gentle amplitude envelope
            env = min(1.0, t * 4) * min(1.0, (seconds - t) * 4)
            sample = 0.0
            for f in freqs:
                sample += math.sin(2 * math.pi * f * t)
            sample = (sample / len(freqs)) * env * 0.6
            v = int(max(-1, min(1, sample)) * 32767)
            frames += struct.pack("<hh", v, v)
        w.writeframes(bytes(frames))
    print("wrote", path)

tone("Decks Demo - Deep Pulse.wav", 6, [110, 220, 330], "Decks Demo")
tone("Decks Demo - Neon Sweep.wav", 6, [196, 261, 392], "Decks Demo")
tone("Decks Demo - Midnight Bass.wav", 7, [82, 164, 246], "Decks Demo")

print("done ->", os.listdir(OUT))
