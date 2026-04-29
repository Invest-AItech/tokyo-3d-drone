#!/bin/bash
set -e

RUNTIME_ROOT="${RUNTIME_ROOT:-/app/runtime}"

# Ensure requests/ directory exists (writable container filesystem)
mkdir -p "${RUNTIME_ROOT}/requests"

# If GCS FUSE is mounted, symlink datasets/ to the FUSE mount
GCS_MOUNT="${GCS_DATASETS_PATH:-/gcs-data/datasets}"
if [ -d "${GCS_MOUNT}" ] && [ ! -d "${RUNTIME_ROOT}/datasets/my_dataset/assets" ]; then
    echo "GCS FUSE detected at ${GCS_MOUNT}"
    rm -rf "${RUNTIME_ROOT}/datasets"
    ln -sf "${GCS_MOUNT}" "${RUNTIME_ROOT}/datasets"
    echo "Linked: ${RUNTIME_ROOT}/datasets -> ${GCS_MOUNT}"
else
    echo "Using local datasets at ${RUNTIME_ROOT}/datasets"
fi

echo "Starting server on port ${PORT:-8080}"
exec python -m app.server
