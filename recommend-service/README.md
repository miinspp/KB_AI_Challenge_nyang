# 맞춤 정책·금융상품 추천 서비스 (기능②)

진단 결과를 받아 소상공인에게 맞는 정책자금·지원제도를 추천한다.
**하드필터 → 규칙 점수 → 임베딩 유사도(bge-m3) → Haiku 근거 생성** 파이프라인.

## 구조
```
recommend-service/
  engine.py        # 하드필터 · 규칙점수 · 임베딩 · 하이브리드 정렬
  app.py           # FastAPI (POST /api/recommend), 정책→카드 스키마 변환, Haiku 근거
  requirements.txt
  data/
    seoul_policies_enriched.json   # enrich_policies.py 산출물 (439건)
    doc_vectors.npy                # bge-m3 임베딩 캐시 (최초 실행 시 자동 생성)
```

## 실행
```bash
cd recommend-service
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...          # (선택) Haiku 근거 문장. 없으면 규칙 근거 사용
uvicorn app:app --port 8000 --reload
```
프론트는 `vite.config.js`에서 `/api/recommend` → `:8000` 프록시가 걸려 있어 그대로 연동된다.

## 동작 모드 (graceful degradation)
- **임베딩**: `sentence-transformers` + bge-m3 사용. 미설치/오프라인이면 자동으로 TF-IDF 폴백(무설치 실행 가능).
- **근거 문장**: `ANTHROPIC_API_KEY` 있으면 Haiku, 없으면 규칙이 만든 evidence를 그대로 사용.
- 프론트는 이 서비스가 꺼져 있으면 기존 규칙기반 추천으로 자동 폴백 → 데모 중 서비스가 죽어도 화면은 산다.

## 요청/응답
```
POST /api/recommend
{
  "region": "서울", "biz_age_years": 2, "industry": "카페",
  "debt_ratio": 0.55, "area_risk": 0.72, "cash_flow_gap_prob": 0.41,
  "sales_percentile": 38, "need_keywords": "운전자금 부족",
  "risk_tolerance": "stable",     // "stable"(안정) | "growth"(성장)
  "top_k": 6
}
→ { "count": 6, "embedding": "bge-m3", "llm": true,
    "products": [ { id, name, tag, icon, fit, reason, spec1, spec2,
                    deadline, daysLeft, details[], _scores{rule,embedding,evidence} }, ... ] }
```
`products`는 프론트 `RecommendScreen`이 수정 없이 렌더하는 스키마다.
`_scores`는 발표·디버깅용(왜 추천됐는지 축별 점수·근거).

## 튜닝 포인트 (engine.py 상단)
- `W_RULE / W_EMB` : 규칙 vs 의미유사도 가중치 (기본 0.55 / 0.45)
- `TH_DEBT / TH_AREA_RISK / TH_CASH_GAP` : 조건 발동 임계값
- `rule_score()`의 조건별 가점 — 우선순위를 다르게 주려면 여기 수정
