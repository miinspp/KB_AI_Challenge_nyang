import { useMemo } from 'react';
import IndustryPicker from './IndustryPicker';
import AreaTypeTabs from './AreaTypeTabs';
import HometaxLink from './HometaxLink';
import { topPercentOf } from './percentile';
import { manToWon, fmtMan } from '../../shared/format';

/**
 * 화면 1 — 진단 입력.
 * 서울시 상권분석서비스 데이터로 실제 산출 가능한 값만 받는다:
 *   업종(필수) · 상권유형(선택) · 월 매출(필수) · 월 지출(선택, 순수익·비용효율용)
 *   + 선택 비용 세부(임대료·인건비·재료비) — 임대료가 있으면 비용구조 축이 추가된다.
 * 업종을 고르면 표본 규모를, 매출을 입력하면 실측 분포 기준 예상 위치를 즉시 보여준다.
 */
export default function InfoScreen({ industries, diag, setDiag, detail, onHometaxLinked }) {
  const set = (patch) => setDiag((d) => ({ ...d, ...patch }));

  const selected = useMemo(
    () => industries.find((i) => i.code === diag.industryCode),
    [industries, diag.industryCode],
  );

  // 실시간 예상 위치 — 선택 업종 상세(분포 격자)가 로드됐고 매출이 입력됐을 때
  const livePreview = useMemo(() => {
    const q = detail?.code === diag.industryCode ? detail?.quantiles : null;
    const salesWon = manToWon(diag.salesMan);
    if (!q || !(salesWon > 0)) return null;
    return topPercentOf(q, salesWon);
  }, [detail, diag.industryCode, diag.salesMan]);

  return (
    <div className="scr">
      <div>
        <h1 className="h1">사장님, 반가워요!<br />우리 가게 위치부터 확인할게요</h1>
        <p className="sub">
          서울시 상권분석서비스 실측 데이터로,<br />같은 업종에서 우리 가게가 <b>상위 몇 %</b>인지 알려드려요.
        </p>
      </div>

      <IndustryPicker
        industries={industries}
        value={diag.industryCode}
        selected={selected}
        onChange={(code) => set({ industryCode: code, areaType: '' })}
      />

      {selected && (
        <AreaTypeTabs
          available={selected.areaTypes}
          value={diag.areaType}
          onChange={(t) => set({ areaType: t })}
        />
      )}

      <HometaxLink onLinked={onHometaxLinked} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="label-sm">
          우리 가게 월 매출·지출 <span style={{ color: '#D0564C', fontWeight: 800 }}>*</span>
          <span style={{ fontWeight: 500, color: '#C4BAAD' }}> · 최근 월평균 기준</span>
        </p>
        <div className="input-row">
          <span className="k" style={{ width: 96 }}>월 평균 매출</span>
          <input value={diag.salesMan} onChange={(e) => set({ salesMan: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="예: 2,500" inputMode="numeric" />
          <span className="u">만원</span>
        </div>
        <div className="input-row">
          <span className="k" style={{ width: 96 }}>월 평균 지출</span>
          <input value={diag.expenseMan} onChange={(e) => set({ expenseMan: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="예: 1,900" inputMode="numeric" />
          <span className="u">만원</span>
        </div>
        <p style={{ fontSize: 11.5, color: '#C4BAAD', lineHeight: 1.55 }}>
          지출(재료비·인건비·임대료 등)을 넣으면 순수익·비용효율까지 함께 진단해요.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="label-sm">
          지출 세부 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 선택 · 넣을수록 진단이 정밀해져요</span>
        </p>
        {[
          ['rentMan', '월 임대료', '예: 250', '비용 구조 건전성 진단에 사용'],
          ['laborMan', '월 인건비', '예: 400', ''],
          ['purchaseMan', '월 재료비(매입)', '예: 900', ''],
        ].map(([key, label, ph]) => (
          <div key={key} className="input-row">
            <span className="k" style={{ width: 110 }}>{label}</span>
            <input value={diag[key]} onChange={(e) => set({ [key]: e.target.value.replace(/[^\d]/g, '') })}
              placeholder={ph} inputMode="numeric" />
            <span className="u">만원</span>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: '#C4BAAD', lineHeight: 1.55 }}>
          임대료를 넣으면 <b style={{ color: '#8A8178' }}>임대료 부담률(10% 이하 건전)</b> 기준 비용 구조 진단이 추가돼요.
          홈택스 연동 시 자동으로 채워져요.
        </p>
      </div>

      {livePreview != null && (
        <div className="pop" style={{
          background: 'linear-gradient(165deg,#FFF3D2,#FFF9EF)', border: '1.5px solid #F3E4C0',
          borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>✨</span>
          <div>
            <p style={{ fontSize: 12.5, color: '#8A7A55', fontWeight: 600 }}>
              입력하신 매출이면 <b style={{ color: '#2B2825' }}>{selected?.name}</b> 매출 기준
            </p>
            <p style={{ fontSize: 17, fontWeight: 900, color: '#2B2825', marginTop: 2 }}>
              대략 상위 {livePreview}%
              <span style={{ fontSize: 12, fontWeight: 700, color: '#A79C8E' }}>
                {' '}· 중위 {fmtMan(selected?.medianMonthlySales)}
              </span>
            </p>
            <p style={{ fontSize: 11, color: '#B9B0A4', marginTop: 3 }}>
              분석하기를 누르면 순수익·비용효율까지 합쳐 정밀 진단해요
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
