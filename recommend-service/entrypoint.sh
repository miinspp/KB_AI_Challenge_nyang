#!/bin/sh
# 컨테이너 시작 시 파인튜닝 임베딩 모델을 S3에서 받아온다(최초 1회, 볼륨에 캐시되면 스킵).
# MODEL_S3_URI 미설정 또는 다운로드 실패 시 engine.py 가 bge-m3 공개모델로 자동 폴백한다.
set -e

MODELS_DIR="../pipeline/models"

if [ -n "$MODEL_S3_URI" ] && [ ! -d "$MODELS_DIR/ko-sroberta-reco" ]; then
  echo "[entrypoint] fetching fine-tuned models from $MODEL_S3_URI ..."
  aws s3 sync "$MODEL_S3_URI" "$MODELS_DIR" || echo "[entrypoint] model fetch failed — falling back to bge-m3 at runtime"
fi

exec "$@"
