# KB 사장님 금융진단 — Frontend (React + Vite)

## 실행
```bash
npm install
npm run dev   # http://localhost:5173  (백엔드 :8080 필요)
```
`vite.config.js` 의 프록시가 `/api/*` 요청을 Spring Boot(`localhost:8080`)로 전달합니다.
다른 주소를 쓰려면 `VITE_API_BASE` 환경변수를 지정하세요.

## 화면 흐름 (App.jsx 상태 머신)
0. **진단 입력** — 업종·상권유형·월매출·월지출 (홈택스 자동 채움 지원)
1. **진단 리포트** — 서울시 실측 분포 기준 상위 % + 분포 곡선 + 3대 지표
2. **맞춤 상품 추천** — 진단 결과로 우선순위를 매긴 KB 상품
3. **금융 시뮬레이터** — 상품 장착 시 지표 변화 (현금흐름 기준선 = 진단 순수익)
4. **분석 포트폴리오** — 최종 요약 + 가입 링크

## 폴더 구조 (기능별)
```
src/
  App.jsx                     화면 흐름 + 공용 상태
  api/
    http.js                   fetch 헬퍼 (에러 메시지 파싱)
    diagnosis.js              GET /api/meta,/industries,/industries/{code} · POST /api/rank
    hometax.js                POST /api/hometax/link
  shared/
    Header.jsx                상단 진행 표시줄
    format.js                 금액(원↔만원)·비율 표기 헬퍼
  features/
    diagnosis/                화면 0·1 (진단)
      InfoScreen.jsx          입력 오케스트레이션 + 실시간 예상 위치
      IndustryPicker.jsx      업종 선택 + 실측 표본 카드
      AreaTypeTabs.jsx        상권유형(골목/발달/전통시장) 선택
      HometaxLink.jsx         홈택스 연동 → 매출/지출 자동 채움
      ReportScreen.jsx        진단 리포트
      DistributionChart.jsx   분포 격자(quantiles) SVG + 내 위치
      percentile.js           백엔드와 동일한 역보간 (실시간 미리보기용)
    recommend/                화면 2 (추천)
      RecommendScreen.jsx
      products.js             KB 상품 카탈로그
      recommend.js            진단 결과 기반 우선순위 산출
    simulator/                화면 3·4 (시뮬레이터·포트폴리오)
      SimulatorScreen.jsx
      PortfolioScreen.jsx
      Couple.jsx              사장님 부부 캐릭터
      sim.js                  장착 상품 → 지표 변화 계산
```

## 백엔드 연동 (com.nyang, Spring Boot)
| Method | URL | Body / Query | 용도 |
|---|---|---|---|
| GET | `/api/meta` | — | 데이터 출처·기준 분기 |
| GET | `/api/industries` | — | 업종 목록(코드·표본·중위매출·상권유형) |
| GET | `/api/industries/{code}` | — | 업종 상세(분포 격자 quantiles) |
| POST | `/api/rank` | `{industryCode, monthlySales, monthlyExpense, areaType?, costBreakdown?, salesHistory?}` | 상위 % 산출 |
| POST | `/api/hometax/link` | `{businessNumber, consent}` | 매출/지출 자동 조회(현재 시뮬레이션) |

데이터 출처: 서울시 상권분석서비스(추정매출-상권, OA-15572) · 소상공인실태조사(업종 평균 영업이익률).
파이프라인(`../pipeline/build_distributions.py`)이 `backend/.../industry_distributions.json` 을 생성합니다.

### 산출식 (RankService v2)
- 기본 3축: 매출 퍼센타일(실측 분포 역보간) 0.5 · 순수익 퍼센타일(유도 분포) 0.3 · 비용효율(벤치마크 대비) 0.2
- 보정축(입력 있을 때만, 각 15%): **비용구조** = 임대료 부담률(10% 이하 건전 경험칙) ·
  **매출안정성** = 최근 월별 매출의 추세(±5%/월 포화)와 변동계수(5~30%) 50:50
- 종합 = (1 − 보정축 가중치 합) × 기본 3축 + 보정축 점수, 상위% = 100 − 종합.
  보정 입력이 없으면 v1 과 동일(하위호환). 각 축의 근거·한계는 응답 `notes` 에 명시.

## 데모용 값 (백엔드 미제공)
- `products.js` 의 상품 목록·효과치(`eff`)·가입 링크
- 시뮬레이터 지표 중 이자·부채비율·신용점수 기준선(`BASE`) — 현금흐름만 진단 순수익으로 대체됨
