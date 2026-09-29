#!/bin/sh
# Copies the Obsidian word list into the app.
set -e
cd "$(dirname "$0")"
cp "$HOME/Downloads/Obsidian/nikchistov/Иностранные языки/Словарь/500 английских слов.md" words.md
echo "words.md обновлён: $(grep -c '^?$' words.md) карточек"
