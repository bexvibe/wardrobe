#!/bin/bash
# Downloads every image listed in photo-urls.txt into a "wardrobe-photos" folder
# next to this script. Each line in photo-urls.txt should look like:
#   filename.jpg | https://the-image-url.com/photo.jpg

FOLDER="wardrobe-photos"
LISTFILE="photo-urls.txt"

mkdir -p "$FOLDER"

while IFS='|' read -r name url; do
  name=$(echo "$name" | xargs)   # trim whitespace
  url=$(echo "$url" | xargs)
  if [ -z "$name" ] || [ -z "$url" ]; then
    continue
  fi
  echo "Downloading: $name"
  curl -sL "$url" -o "$FOLDER/$name"
done < "$LISTFILE"

echo ""
echo "Done. Photos saved in ./$FOLDER"
