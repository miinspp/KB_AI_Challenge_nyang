"""정책 공고 → 구조화 3줄 요약(지원/대상/신청) KoBART 파인튜닝.

데이터: pipeline/data/policy_summaries.jsonl (Claude teacher 레이블, 지식 증류).
분할: 소상공인 타깃 37건(서비스 노출분)은 학습에서 제외하고 검증셋으로 사용
      → 모델이 "본 적 없는 공고"를 요약하는 일반화 성능을 그대로 측정.
베이스: EbanLee/kobart-summary-v3 (KoBART 요약 파인튜닝 체크포인트에서 도메인·형식 적응)

실행:  .venv/bin/python pipeline/train_summarizer.py
산출:  pipeline/models/kobart-policy-summary/  (약 500MB, git 미추적)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "pipeline/data/policy_summaries.jsonl"
TARGET_IDS_PATH = ROOT / "pipeline/data/val_target_ids.json"
OUT_DIR = ROOT / "pipeline/models/kobart-policy-summary"

BASE_MODEL = "EbanLee/kobart-summary-v3"
MAX_SRC, MAX_TGT = 512, 96
EPOCHS, BATCH, ACCUM, LR = 6, 4, 2, 3e-5


def build_source(rec: dict) -> str:
    """공고 원문 + 구조 필드를 요약 입력으로 합친다 (숫자 복사 정확도 향상)."""
    parts = [rec["title"], rec["summary"]]
    if rec.get("apply_period"):
        parts.append(f"신청기간: {rec['apply_period']}")
    if rec.get("apply_method"):
        parts.append(f"신청방법: {rec['apply_method']}")
    if rec.get("max_amount_manwon"):
        parts.append(f"최대지원: {rec['max_amount_manwon']}만원")
    if rec.get("max_biz_age"):
        parts.append(f"업력요건: {rec['max_biz_age']}년 이내")
    return "\n".join(parts)


class SumDataset(Dataset):
    def __init__(self, records: list[dict], tokenizer):
        self.records = records
        self.tok = tokenizer

    def __len__(self):
        return len(self.records)

    def __getitem__(self, i):
        r = self.records[i]
        src = self.tok(build_source(r), max_length=MAX_SRC, truncation=True)
        tgt = self.tok(text_target=r["target"], max_length=MAX_TGT, truncation=True)
        return {"input_ids": src["input_ids"], "labels": tgt["input_ids"]}


def collate(batch, pad_id):
    max_src = max(len(b["input_ids"]) for b in batch)
    max_tgt = max(len(b["labels"]) for b in batch)
    input_ids, attn, labels = [], [], []
    for b in batch:
        s, t = b["input_ids"], b["labels"]
        input_ids.append(s + [pad_id] * (max_src - len(s)))
        attn.append([1] * len(s) + [0] * (max_src - len(s)))
        labels.append(t + [-100] * (max_tgt - len(t)))
    return {
        "input_ids": torch.tensor(input_ids),
        "attention_mask": torch.tensor(attn),
        "labels": torch.tensor(labels),
    }


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    records = [json.loads(l) for l in DATA_PATH.read_text().splitlines() if l.strip()]
    val_ids = set(json.loads(TARGET_IDS_PATH.read_text()))
    train = [r for r in records if r["id"] not in val_ids]
    val = [r for r in records if r["id"] in val_ids]
    print(f"[train] {len(train)} train / {len(val)} val (서비스 타깃 37건은 학습 제외)")

    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL).to(device)

    pad_id = tok.pad_token_id
    dl = DataLoader(SumDataset(train, tok), batch_size=BATCH, shuffle=True,
                    collate_fn=lambda b: collate(b, pad_id))
    vdl = DataLoader(SumDataset(val, tok), batch_size=BATCH, shuffle=False,
                     collate_fn=lambda b: collate(b, pad_id))

    steps_total = math.ceil(len(dl) / ACCUM) * EPOCHS
    warmup = max(1, int(steps_total * 0.1))
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: s / warmup if s < warmup else max(0.0, (steps_total - s) / (steps_total - warmup)),
    )

    best_val = float("inf")
    step = 0
    for ep in range(1, EPOCHS + 1):
        model.train()
        running = 0.0
        for i, batch in enumerate(dl):
            batch = {k: v.to(device) for k, v in batch.items()}
            loss = model(**batch).loss / ACCUM
            loss.backward()
            running += loss.item() * ACCUM
            if (i + 1) % ACCUM == 0 or i + 1 == len(dl):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()
                sched.step()
                opt.zero_grad()
                step += 1
        model.eval()
        vloss, n = 0.0, 0
        with torch.no_grad():
            for batch in vdl:
                batch = {k: v.to(device) for k, v in batch.items()}
                vloss += model(**batch).loss.item()
                n += 1
        vloss /= max(n, 1)
        print(f"[train] epoch {ep}/{EPOCHS}  train_loss={running / len(dl):.4f}  val_loss={vloss:.4f}")
        if vloss < best_val:
            best_val = vloss
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(OUT_DIR)
            tok.save_pretrained(OUT_DIR)
            print(f"[train]   -> saved best to {OUT_DIR}")

    print(f"[train] done. best val_loss={best_val:.4f}")


if __name__ == "__main__":
    main()
