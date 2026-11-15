#!/usr/bin/env bash
# Builds the voice load-test tools into ${1:-./tools} (docs/YUK_TESTI.md): livekit-server at production's version
# (compose.yaml) and LiveKit's lk CLI, whose `lk load-test` plays the speakers and listeners. Needs Go 1.24+ and
# ffmpeg with libopus.
#
# lk embeds its speaker clips at build time, and in the published module they are Git LFS pointers, not audio, so
# a speaker would send nothing. This copies lk's source, puts real clips in their place (20 s of speech-band noise
# per clip, Opus 32 kb/s in 20 ms frames, one Ogg page per 20 s so the looper reads them at real time) and builds
# that. lk's latest release needs portaudio; v2.4.0 does not.
set -euo pipefail
OUT=$(mkdir -p "${1:-./tools}" && cd "${1:-./tools}" && pwd)
SERVER=v1.9.1
LK=v2.4.0
export GOBIN="$OUT" GOFLAGS=-mod=mod

go install "github.com/livekit/livekit-server/cmd/server@$SERVER"
mv -f "$OUT/server" "$OUT/livekit-server"

go mod download -x "github.com/livekit/livekit-cli/v2@$LK" >/dev/null 2>&1 || true
SRC=$(go env GOMODCACHE)/github.com/livekit/livekit-cli/v2@$LK
[ -d "$SRC" ] || { echo "lk $LK source not found in the module cache" >&2; exit 1; }
rm -rf "$OUT/lk-src" && cp -r "$SRC" "$OUT/lk-src" && chmod -R u+w "$OUT/lk-src"
i=0
for f in "$OUT"/lk-src/pkg/provider/resources/change-*.ogg; do
  i=$((i + 1))
  ffmpeg -hide_banner -v error -y -f lavfi \
    -i "anoisesrc=color=pink:amplitude=0.25:duration=20:seed=$i,highpass=f=200,lowpass=f=3400,volume='0.6+0.4*sin(2*PI*t*0.7+$i)':eval=frame" \
    -ac 1 -ar 48000 -c:a libopus -b:a 32k -application voip -frame_duration 20 -page_duration 20000 "$f"
done
(cd "$OUT/lk-src" && go build -o "$OUT/lk" ./cmd/lk)
echo "built: $OUT/livekit-server $OUT/lk"
