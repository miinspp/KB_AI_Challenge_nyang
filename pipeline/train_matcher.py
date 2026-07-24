"""프로필→항목 추천 임베딩 contrastive 파인튜닝 (B단계).

문제: 진단 프로필과 정책·상품을 매칭하는 학습 데이터가 없다.
해결: 다양한 사장님 프로필 60개를 조합 생성하고, teacher(Claude)가 각 프로필에
      적합한 항목을 라벨링 → (프로필 문장, 적합 항목 텍스트) 양성 쌍을 만든다.
      MultipleNegativesRankingLoss로 학습(배치 내 다른 항목이 자동 음성) — 소량 데이터에 강함.

베이스: jhgan/ko-sroberta-multitask (1단계와 동일 인코더에서 도메인 적응)
분할: 프로필 id 기준 8:2. 파인튜닝된 모델은 앵커·항목 재인코딩에 그대로 쓰여
      런타임(백엔드 앵커 합성)과 100% 호환된다.

실행:  .venv/bin/python pipeline/train_matcher.py
산출:  pipeline/models/ko-sroberta-reco/  (git 미추적)
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "pipeline/data"
PAIRS_PATH = DATA_DIR / "reco_pairs.jsonl"          # {profile_id, sentence, positive_text}
VAL_IDS_PATH = DATA_DIR / "reco_val_profiles.json"  # 검증 프로필 id
OUT_DIR = ROOT / "pipeline/models/ko-sroberta-reco"

BASE_MODEL = "jhgan/ko-sroberta-multitask"
EPOCHS, BATCH, LR = 4, 16, 2e-5
RNG = random.Random(42)


def main() -> None:
    pairs = [json.loads(l) for l in PAIRS_PATH.read_text().splitlines() if l.strip()]
    val_ids = set(json.loads(VAL_IDS_PATH.read_text()))
    train = [p for p in pairs if p["profile_id"] not in val_ids]
    print(f"[matcher] {len(train)} train pairs / {len(pairs)-len(train)} val pairs held out")

    examples = [InputExample(texts=[p["sentence"], p["positive_text"]]) for p in train]
    RNG.shuffle(examples)

    model = SentenceTransformer(BASE_MODEL)
    loader = DataLoader(examples, shuffle=True, batch_size=BATCH)
    loss = losses.MultipleNegativesRankingLoss(model)   # in-batch negatives

    warmup = int(len(loader) * EPOCHS * 0.1)
    model.fit(
        train_objectives=[(loader, loss)],
        epochs=EPOCHS,
        warmup_steps=warmup,
        optimizer_params={"lr": LR},
        show_progress_bar=True,
        output_path=str(OUT_DIR),
    )
    print(f"[matcher] saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
