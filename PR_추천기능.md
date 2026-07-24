# feat: 맞춤 정책·금융상품 추천 서비스 (기능②)

## 개요
진단 결과(`/api/rank`)를 입력받아 소상공인에게 맞는 정책자금·지원제도를 추천하는 서비스를 추가했습니다.
`소상공인마당(bizinfo)` 정책 공고 데이터(서울·전국 439건)를 기반으로,
**하드필터 → 규칙 점수 → 임베딩 유사도 → LLM 근거 생성**의 하이브리드 추천 파이프라인을 구현했습니다.

기존 하드코딩 상품 목록(`products.js`)을 대체해, 실제 정책 데이터로 개인화 추천이 이뤄집니다.

## 주요 변경 사항

### 신규: Python 추천 서비스 (`recommend-service/`)
- **`engine.py`** — 추천 핵심 로직
  - 하드필터: 마감 지남·타지역·업력 초과 공고를 후보에서 제외 (마감 상품 추천 원천 차단)
  - 규칙 점수: 부채비율·상권위험·현금흐름 부족확률·매출·**위험성향(안정/성장)**을 종합해 0~1 점수 + 근거(evidence) 산출
  - 임베딩 유사도: bge-m3 코사인 유사도 (미설치 환경에선 TF-IDF 자동 폴백)
  - 최종 점수 = 0.55·규칙 + 0.45·임베딩
- **`app.py`** — FastAPI `POST /api/recommend`
  - 정책을 프론트 `RecommendScreen`이 그대로 렌더하는 스키마로 변환 (icon·fit·reason·spec·D-day·details)
  - 상위 후보 근거 문장을 Claude Haiku로 생성 (`ANTHROPIC_API_KEY` 없으면 규칙 근거 사용)
- **`data/seoul_policies_enriched.json`** — 전처리된 정책 439건 (지원유형·대상·업력조건·금액·마감일 구조화)

### 프론트엔드 연동
- **`api/recommend.js`** — 진단 결과(rank)를 추천 프로필로 변환 후 `/api/recommend` 호출
- **`App.jsx`** — 진단 성공 시 추천을 비동기 호출, **실패 시 기존 규칙기반(`recommendProducts`)으로 자동 폴백**
- **`RecommendScreen.jsx`** — 마감 임박 D-day 뱃지 추가
- **`vite.config.js`** — `/api/recommend` → 추천 서비스(:8000), 그 외 `/api` → Spring(:8080) 프록시 분기

## 설계 의도

### 왜 파인튜닝이 아니라 RAG인가
(사용자 조건 → 정답 정책) 라벨 데이터가 없고, 정책은 매주 갱신되며, 마감일·금액 환각은 금융 서비스에 치명적입니다.
따라서 학습 모델 대신 **하드필터(코드) + 임베딩 검색 + LLM 근거 생성** 구조를 택했습니다.
크롤링만 다시 돌리면 즉시 최신화되고, 추천 근거를 항상 원문에서 인용합니다.

### 3중 폴백 (데모 안정성)
- 임베딩: bge-m3 → (미설치 시) TF-IDF
- 근거 문장: Haiku → (키 없을 시) 규칙 evidence
- 서비스 자체: 다운 시 → 프론트가 기존 규칙기반 추천으로 전환

데모 중 어느 구성요소가 죽어도 추천 화면은 항상 동작합니다.

## 실행 방법
```bash
cd recommend-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...   # (선택) Haiku 근거 문장
uvicorn app:app --port 8000    # --reload 없이 실행 권장 (venv 감시 재시작 방지)
```
프론트는 `vite.config.js` 프록시가 걸려 있어 별도 설정 없이 연동됩니다.

## 검증
- 실제 439건에 대해 `POST /api/recommend` 200 응답 확인
- 하드필터 위반(마감·타지역) 0건 확인
- 위험성향(stable/growth)에 따라 점수·근거가 분기되는 것 확인
- 프론트 3개 수정 파일 문법 검증 통과

## 리뷰어 확인 요청
- [ ] `data/doc_vectors.npy`(bge-m3 임베딩 캐시)는 커밋에서 제외했습니다(빌드 산출물, `.gitignore` 추가).
- [ ] `rankToProfile`에서 부채비율·상권위험을 진단 마진값으로 **근사**했습니다 — 실제 부채 입력 폼이 생기면 교체 예정(코드 주석 표기).
- [ ] 최초 실행 시 bge-m3 모델(~2GB) 다운로드가 필요합니다. 디스크 여유 없으면 TF-IDF 폴백으로 실행됩니다.

## 향후 (별도 PR)
- 추천 파이프라인을 상위 agent의 tool(`recommend_policies`)로 노출 → 진단·시뮬레이션과 함께 오케스트레이션
- 사용자 위험성향 선택 UI(진단 화면 토글) 연결
