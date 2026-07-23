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
    doc_vectors.npy                # bge-m3 임베딩 캐시 (최초 실행 시 자동 생성, git 미포함)
```

---

## 전체 실행 순서

이 프로젝트는 **3개 프로세스**를 각각 다른 터미널에서 띄운다.

| 순서 | 서비스 | 위치 | 포트 |
|---|---|---|---|
| 1 | 추천 서비스 (Python/FastAPI) | `recommend-service/` | 8000 |
| 2 | 백엔드 (Spring Boot) | `backend/` | 8080 |
| 3 | 프론트 (Vite/React) | `frontend/` | 5173 |

프론트의 `vite.config.js`가 `/api/recommend` → `:8000`, 그 외 `/api` → `:8080`으로 프록시한다.
접속은 `http://localhost:5173` (5173이 사용 중이면 자동으로 5174 등으로 뜬다).

---

## 1) 추천 서비스 — Python (기능②, 이 폴더)

> 처음 실행 시 bge-m3 모델(약 2GB)을 자동 다운로드한다. 최초 1회만.

### macOS / Linux
```bash
cd recommend-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...          # (선택) Haiku 근거 문장. 없으면 규칙 근거 사용
uvicorn app:app --port 8000
```

### Windows (PowerShell)
```powershell
cd recommend-service
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ANTHROPIC_API_KEY="..."          # (선택)
uvicorn app:app --port 8000
```

### Windows (cmd)
```cmd
cd recommend-service
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
set ANTHROPIC_API_KEY=...
uvicorn app:app --port 8000
```

성공하면 아래가 뜬다:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```
확인: 브라우저에서 `http://localhost:8000/health` → `{"status":"ok","policies":439,...}`

> ⚠️ `--reload`는 붙이지 말 것. venv 폴더까지 감시해서 모델 다운로드 중 무한 재시작이 걸린다.
> 다음 실행부터는 `source venv/bin/activate`(맥) 또는 `venv\Scripts\activate`(윈도우) 후 `uvicorn app:app --port 8000`만 하면 된다.

## 2) 백엔드 — Spring Boot
```bash
# macOS / Linux
cd backend && ./gradlew bootRun
```
```cmd
:: Windows
cd backend && gradlew.bat bootRun
```

## 3) 프론트 — Vite
```bash
cd frontend
npm install
npm run dev
```

---

## 동작 모드 (graceful degradation)
- **임베딩**: `sentence-transformers` + bge-m3. 미설치/오프라인이면 자동 TF-IDF 폴백(무설치 실행 가능, 품질만 소폭 하락).
- **근거 문장**: `ANTHROPIC_API_KEY` 있으면 Haiku, 없으면 규칙이 만든 evidence를 그대로 사용.
- **프론트 폴백**: 이 서비스가 꺼져 있으면 프론트가 기존 규칙기반 추천(고정 KB 상품 6개)으로 자동 폴백 → 데모 중 죽어도 화면은 산다.
  - 반대로 말하면, **추천이 매번 똑같은 KB 상품 6개면 이 서비스가 안 켜진 것**이다. 실제 추천은 공고명("2026년…", "[서울]…")으로 뜬다.

## 요청 / 응답
```
POST /api/recommend
{
  "region": "서울",
  "biz_age_years": 2,
  "industry": "카페",
  "debt_ratio": 0.55,                 // 부채잔액 / 연매출 (0~1)
  "market_risk_level": "HIGH",        // LOW | MEDIUM | HIGH (시뮬 marketRiskLevel과 통일)
  "cash_flow_gap_prob": 0.41,         // 현금부족 확률 (0~1)
  "sales_percentile": 38,             // 매출 상위% (작을수록 우수)
  "need_keywords": "고금리 대출 대환, 긴급 운전자금",  // 재무신호 기반 동적 생성
  "top_k": 6
}

→ {
  "count": 6, "embedding": "bge-m3", "llm": true,
  "products": [ { id, name, tag, icon, fit, reason, spec1, spec2,
                  deadline, daysLeft, isFinance, link, details[],
                  _scores{rule,embedding,evidence} }, ... ]
}
```
`products`는 프론트 `RecommendScreen`이 수정 없이 렌더하는 스키마다.
`_scores`는 발표·디버깅용(왜 추천됐는지 축별 점수·근거).

## 튜닝 포인트 (engine.py 상단)
- `W_RULE / W_EMB` : 규칙 vs 의미유사도 가중치 (기본 0.55 / 0.45)
- `TH_DEBT / TH_CASH_GAP` : 부채·현금부족 조건 발동 임계값 (0.4 / 0.3)
- 상권위험은 `market_risk_level == "HIGH"`일 때 컨설팅·판로 지원 가점
- `rule_score()`의 조건별 가점 — 우선순위를 다르게 주려면 여기 수정

## 트러블슈팅
| 증상 | 원인 / 해결 |
|---|---|
| `externally-managed-environment` (pip 오류) | 시스템 파이썬 보호. 위처럼 **venv를 만들어 활성화**한 뒤 설치 |
| `proxy error /api/recommend ECONNREFUSED` | 추천 서비스(8000)가 아직 안 켜짐. 모델 다운로드 완료까지 대기 |
| `Port 5173 is in use` | 정상. Vite가 5174 등으로 자동 변경 → 그 주소로 접속 |
| 추천이 KB 상품 6개만 반복 | 추천 서비스 미기동 → 폴백 상태. 8000 서버 확인 |
| 모델 다운로드가 오래 걸림 | `requirements.txt`에서 `sentence-transformers` 줄만 빼고 설치 → TF-IDF로 즉시 실행 |
