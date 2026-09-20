#!/usr/bin/env bash
set -e

REPO="arjun-vegeta/loopCode"
INSTALL_DIR="$HOME/.loopcode"
BIN_DIR="/usr/local/bin"

if ! command -v bun >/dev/null 2>&1; then
    echo "Error: LoopCode requires Bun to be installed."
    echo "Please install Bun first: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "Fetching latest release source of LoopCode..."
TARBALL_URL="https://github.com/$REPO/archive/refs/tags/v2.0.0.tar.gz"

echo "Downloading LoopCode from: $TARBALL_URL"
mkdir -p "$INSTALL_DIR"
curl -L "$TARBALL_URL" -o "$INSTALL_DIR/source.tar.gz"

echo "Extracting LoopCode..."
tar -xzf "$INSTALL_DIR/source.tar.gz" -C "$INSTALL_DIR" --strip-components=1
rm "$INSTALL_DIR/source.tar.gz"

echo "Installing dependencies..."
cd "$INSTALL_DIR"
bun install

echo "Building LoopCode..."
bun run build

echo "Creating launcher wrapper..."
cat << 'EOF' > "$INSTALL_DIR/loopcode-runner"
#!/usr/bin/env bash
exec bun "$HOME/.loopcode/dist/index.js" "$@"
EOF
chmod +x "$INSTALL_DIR/loopcode-runner"

echo "Installing loopcode binary link..."
if [ -w "$BIN_DIR" ]; then
    ln -sf "$INSTALL_DIR/loopcode-runner" "$BIN_DIR/loopcode"
    echo "✓ LoopCode installed to $BIN_DIR/loopcode"
else
    LOCAL_BIN="$HOME/.local/bin"
    mkdir -p "$LOCAL_BIN"
    ln -sf "$INSTALL_DIR/loopcode-runner" "$LOCAL_BIN/loopcode"
    echo "✓ LoopCode installed to $LOCAL_BIN/loopcode"
    echo "Please ensure $LOCAL_BIN is in your PATH."
fi
