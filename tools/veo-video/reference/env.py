import subprocess, sys, numpy as np
def envelope(path, step=0.1):
    raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-vn","-af","highpass=f=250,lowpass=f=3800","-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32)/32768
    n = int(16000*step)
    return [20*np.log10(np.sqrt(np.mean(x[i:i+n]**2))+1e-9) for i in range(0, len(x)-n+1, n)]
for p in sys.argv[1:]:
    e = envelope(p); floor = np.percentile(e, 15)
    print(p.split('/')[-1], f"floor {floor:.0f}dB")
    print(" ".join(f"{i/10:.1f}:{'#'*max(0,int((v-floor)/3))}" for i, v in enumerate(e) if v-floor > 6))
