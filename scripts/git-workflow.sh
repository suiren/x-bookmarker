#!/bin/bash

# Git Workflow Helper Script
# Usage: ./scripts/git-workflow.sh <branch-name> <commit-message>

set -e

BRANCH_NAME="$1"
COMMIT_MESSAGE="$2"

if [ -z "$BRANCH_NAME" ] || [ -z "$COMMIT_MESSAGE" ]; then
    echo "Usage: $0 <branch-name> <commit-message>"
    echo "Example: $0 feature/add-search 'feat: 検索機能の実装'"
    exit 1
fi

# Check if we're already on the target branch
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    # Check if branch exists
    if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
        echo "Switching to existing branch: $BRANCH_NAME"
        git checkout "$BRANCH_NAME"
    else
        echo "Creating new branch: $BRANCH_NAME"
        git checkout -b "$BRANCH_NAME"
    fi
fi

# Add all changes
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "No changes to commit"
    exit 0
fi

# Commit with the provided message
git commit -m "$COMMIT_MESSAGE

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push -u origin "$BRANCH_NAME"

echo "✅ Successfully committed and pushed changes to branch: $BRANCH_NAME"