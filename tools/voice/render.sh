#!/bin/sh
# Renders every line in lines.json to an Ogg file the game loads by key.
# eSpeak NG speaks the Turkish text; ffmpeg lowers it, compresses it and adds a hall echo
# so it sounds like an arena announcer rather than a screen reader.
set -eu

here=$(dirname "$0")
out=${1:-apps/web/public/games/siper/voice}
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

jq -r 'to_entries[] | "\(.key)\t\(.value)"' "$here/lines.json" | while IFS="$(printf '\t')" read -r key text; do
  espeak-ng -v tr -s 138 -p 28 -a 180 -g 2 -w "$tmp/$key.wav" "$text" </dev/null
  ffmpeg -nostdin -loglevel error -y -i "$tmp/$key.wav" \
    -af "asetrate=22050*0.86,aresample=44100,highpass=f=90,lowpass=f=7000,acompressor=threshold=-20dB:ratio=6:attack=5:release=120,aecho=0.8:0.6:70|140:0.35|0.2,loudnorm=I=-14:TP=-1.5:LRA=7" \
    -ac 1 -c:a libvorbis -q:a 5 "$out/$key.ogg"
  echo "$key: $text"
done
