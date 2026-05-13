#!/bin/bash
# Run this from your Terminal to commit and push to GitHub
cd "$(dirname "$0")"

# Clean up any sandbox git cruft
rm -rf .git

# Init fresh
git init
git checkout -b main

# Stage only the web files
git add index.html services.html about.html contact.html support.html styles.css design-system.html campbellnet-logo.png vercel.json .gitignore

# Commit
git commit -m "Initial design system — colors, typography, components"

# Point to the repo we already created
git remote add origin https://github.com/ianscampbell332/campbellnet-web.git

# Push
git push -u origin main

echo ""
echo "✓ Done — check https://github.com/ianscampbell332/campbellnet-web"
