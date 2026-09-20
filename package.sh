#!/usr/bin/env bash
set -e

echo "Building LoopCode..."
bun build --compile --minify \
  --external sqlite-vec \
  --external onnxruntime-node \
  --external tree-sitter \
  --external tree-sitter-javascript \
  --external tree-sitter-typescript \
  src/index.ts --outfile loopcode

echo "Packaging native dependencies..."
mkdir -p dist/node_modules
cp loopcode dist/
cp -r node_modules/sqlite-vec dist/node_modules/
cp -r node_modules/onnxruntime-node dist/node_modules/
cp -r node_modules/tree-sitter dist/node_modules/
cp -r node_modules/tree-sitter-javascript dist/node_modules/
cp -r node_modules/tree-sitter-typescript dist/node_modules/

echo "Creating release archive..."
cd dist
tar -czf loopcode-release.tar.gz loopcode node_modules/
cd ..

echo "Done! Release archive created at dist/loopcode-release.tar.gz"
