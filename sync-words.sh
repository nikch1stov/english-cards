#!/bin/sh
# Copies the Obsidian word list into the app and publishes it to GitHub Pages.
set -e
cd "$(dirname "$0")"
cp "$HOME/Downloads/Obsidian/nikchistov/Иностранные языки/Словарь/500 английских слов.md" words.md
echo "words.md обновлён: $(grep -c '^?$' words.md) карточек"

if git diff --quiet -- words.md; then
  echo "Изменений в словаре нет"
  exit 0
fi
git add words.md
git commit -q -m "Update words"
git push -q
echo "Опубликовано, через 1–2 минуты слова появятся в приложении"
