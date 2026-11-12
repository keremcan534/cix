#!/usr/bin/env bash
# Şeffaf video (yöntem D): any RGBA source → one H.264 MP4 with the frame stacked, colour in the TOP half and the
# alpha mask as greyscale in the BOTTOM half (encoded height = 2 × visible height). The app's AlphaVideoView
# (modules/similar-alpha-video) puts them back together on the GPU. Spec: docs/SEFFAF_VIDEO_POC.md.
#
#   scripts/alpha-stack.sh <input> <output.mp4> [--height 720] [--fps 30] [--crf 24] [--premultiplied]
#
# <input>: a PNG sequence (frames/%05d.png; --fps is its frame rate, default 30), a ProRes 4444 .mov or a VP8/VP9
# WebM with alpha. --height scales to that visible height (width keeps the aspect, rounded to even). --premultiplied:
# the source's colours are premultiplied by alpha (some After Effects exports); they are made straight first.
# No audio: the overlays are always played muted.
set -euo pipefail

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 2 ] || usage
in=$1; out=$2; shift 2
height=''; fps=''; crf=24; premul=0
while [ $# -gt 0 ]; do
  case $1 in
    --height) height=$2; shift 2 ;;
    --fps) fps=$2; shift 2 ;;
    --crf) crf=$2; shift 2 ;;
    --premultiplied) premul=1; shift ;;
    *) usage ;;
  esac
done

pre=()
seq=0
case $in in
  *%*) seq=1; pre=(-framerate "${fps:-30}") ;;
  *.webm)
    # ffmpeg's own VP8/VP9 decoders drop the WebM alpha; libvpx keeps it.
    if ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$in" | grep -q vp8; then pre=(-c:v libvpx); else pre=(-c:v libvpx-vp9); fi ;;
esac

chain=''
if [ -n "$fps" ] && [ "$seq" = 0 ]; then chain+="fps=$fps,"; fi
if [ -n "$height" ]; then chain+="scale=-2:$height:flags=lanczos,"; else chain+="scale=trunc(iw/2)*2:trunc(ih/2)*2,"; fi
chain+='format=rgba,'
if [ "$premul" = 1 ]; then chain+='format=gbrap,unpremultiply=inplace=1,format=rgba,'; fi

rate=${fps:-}
if [ -z "$rate" ]; then
  rate=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$in" | awk -F/ '{ if ($2 > 0) printf "%d", $1 / $2 + 0.5; else print 30 }')
fi
case $rate in '' | *[!0-9]* | 0) rate=30 ;; esac

ffmpeg -hide_banner -loglevel error -y "${pre[@]}" -i "$in" -an -filter_complex "
  [0:v]${chain}split[c][a];
  [c]format=rgb24[top];
  [a]alphaextract,format=rgb24[bottom];
  [top][bottom]vstack=inputs=2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]" \
  -map '[v]' -c:v libx264 -profile:v main -preset slow -crf "$crf" -refs 3 -g $((rate * 2)) -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart "$out"

ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,profile,level -of compact=p=0 "$out"
echo "$(du -h "$out" | cut -f1)  $out"
