"""Load test, voice side (docs/YUK_TESTI.md): `rooms` rooms of `pubs` speakers and `subs` listeners each, played by
`lk load-test` while livekit-server runs alone on its own core(s). Samples the server's CPU (one core = 100 %) and
memory every second and prints the steady-state average, the peak and each room's summary from lk (tracks, bitrate,
packet loss).

    python3 livekit-load.py <name> <speakers> <listeners> <rooms> <seconds>

Environment: LK (the lk binary built by build-tools.sh, default "lk"), LIVEKIT_URL (default ws://127.0.0.1:7880),
LIVEKIT_API_KEY / LIVEKIT_API_SECRET (a key of the server under test), TESTER_CORES (cores for the testers,
default 1-3: keep them off the server's), LIVEKIT_PID (default: the process named livekit-server or server),
OUT (folder for the testers' logs, default ./out).

Speakers play build-tools.sh's clips: speech-band noise that never pauses, so every speaker sends 50 packets a
second the whole time (no silence for DTX). A real room, where one or two people talk at a time, costs less.
"""
import os
import subprocess
import sys
import time

name, pubs, subs, rooms, dur = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
LK = os.environ.get('LK', 'lk')
URL = os.environ.get('LIVEKIT_URL', 'ws://127.0.0.1:7880')
KEY, SECRET = os.environ['LIVEKIT_API_KEY'], os.environ['LIVEKIT_API_SECRET']
CORES = os.environ.get('TESTER_CORES', '1-3')
OUT = os.environ.get('OUT', 'out')
os.makedirs(OUT, exist_ok=True)


def server_pid():
    if os.environ.get('LIVEKIT_PID'):
        return int(os.environ['LIVEKIT_PID'])
    for comm in ('livekit-server', 'server'):
        r = subprocess.run(['pgrep', '-x', comm], capture_output=True, text=True)
        if r.stdout.split():
            return int(r.stdout.split()[0])
    sys.exit('livekit-server is not running here (or set LIVEKIT_PID)')


pid = server_pid()
tick = os.sysconf('SC_CLK_TCK')


def cpu_ticks(p):
    f = open(f'/proc/{p}/stat').read().rsplit(')', 1)[1].split()
    return int(f[11]) + int(f[12])


def rss_mb(p):
    for line in open(f'/proc/{p}/status'):
        if line.startswith('VmRSS'):
            return int(line.split()[1]) / 1024
    return 0


rate = 25  # joins per second, per room
procs = []
for r in range(rooms):
    log = open(f'{OUT}/{name}-{r}.log', 'w')
    cmd = ['taskset', '-c', CORES, LK, '--url', URL, '--api-key', KEY, '--api-secret', SECRET,
           'load-test', '--room', f'lt-{name}-{r}', '--audio-publishers', str(pubs), '--subscribers', str(subs),
           '--duration', f'{dur}s', '--num-per-second', str(rate), '--identity-prefix', f'{name}{r}',
           # The default speaker layout subscribes each listener to 6 tracks only; a voice room hears every mic.
           '--layout', '4x4']
    procs.append(subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT))
ramp = (pubs + subs) / rate + 4
samples = []
t0 = time.time()
last = (time.time(), cpu_ticks(pid))
while any(p.poll() is None for p in procs):
    time.sleep(1)
    now = (time.time(), cpu_ticks(pid))
    pct = (now[1] - last[1]) / tick / (now[0] - last[0]) * 100
    last = now
    samples.append((now[0] - t0, pct, rss_mb(pid)))
steady = [s for s in samples if ramp + 2 <= s[0] <= ramp + max(10, dur - ramp - 4)]
avg = sum(s[1] for s in steady) / max(1, len(steady))
peak = max((s[1] for s in steady), default=0)
mem = max((s[2] for s in samples), default=0)
print(f'== {name}: {rooms} oda x ({pubs} konuşan + {subs} dinleyen) = {rooms * (pubs + subs)} kişi')
print(f'   livekit işlemci (1 çekirdek = %100): ortalama %{avg:.0f}, tepe %{peak:.0f}; bellek en çok {mem:.0f} MB; ölçülen saniye {len(steady)}')
for r in range(rooms):
    out = open(f'{OUT}/{name}-{r}.log', errors='replace').read()
    summary = out[out.find('Summary'):] if 'Summary' in out else out[-1500:]
    print(f'   --- oda {r}:')
    print('\n'.join('   ' + line for line in summary.strip().splitlines()[-14:]))
