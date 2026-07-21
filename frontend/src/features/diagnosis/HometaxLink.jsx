import { useEffect, useRef, useState } from 'react';
import { postHometaxLink } from '../../api/hometax';
import { fmtMan } from '../../shared/format';

// 간편인증 수단 — 실서비스의 본인인증 위임(공동/간편인증) UI 재현용
const CERTS = [
  { id: 'kakao', name: '카카오', chip: 'K', chipBg: '#FEE500', chipColor: '#3C1E1E' },
  { id: 'naver', name: '네이버', chip: 'N', chipBg: '#03C75A', chipColor: '#fff' },
  { id: 'pass', name: 'PASS', chip: 'P', chipBg: '#E2231A', chipColor: '#fff' },
  { id: 'kb', name: 'KB인증서', chip: 'KB', chipBg: '#FFBC00', chipColor: '#2B2825' },
];

const AUTH_MOCK_MS = 2500; // 프로토타입: 이 시간 뒤 인증이 자동 완료된 것으로 처리

const fmtBizNo = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
};
const fmtPhone = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
};

/**
 * 홈택스 연동 — 실서비스 여정을 그대로 재현한 4단계 플로우.
 *   form(정보 입력·동의) → auth(간편인증 대기, 프로토타입은 자동 완료) → done(자료 수신)
 * 인증 완료 후 /api/hometax/link(시뮬레이션)를 호출해 재무 요약을 받아
 * 상위 입력값(매출·지출·임대료·인건비·재료비)을 자동으로 채운다.
 * 실서비스에서는 auth 단계가 실제 본인인증 위임 + 스크래핑 API 호출로 교체된다.
 */
export default function HometaxLink({ onLinked }) {
  const [step, setStep] = useState('off');           // off | form | auth | done
  const [form, setForm] = useState({ bizNo: '', ownerName: '', birth: '', phone: '', cert: 'kakao' });
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const valid =
    form.bizNo.replace(/\D/g, '').length === 10 &&
    form.ownerName.trim().length >= 2 &&
    form.birth.length === 6 &&
    form.phone.replace(/\D/g, '').length >= 10;
  const certName = CERTS.find((c) => c.id === form.cert)?.name;

  const toggle = () => {
    clearTimeout(timerRef.current);
    setError('');
    setResult(null);
    setStep((s) => (s === 'off' ? 'form' : 'off'));
  };

  // 간편인증 요청 → (프로토타입) 일정 시간 뒤 인증 완료로 간주하고 자료 조회
  const requestAuth = () => {
    if (!valid || !consent) return;
    setError('');
    setStep('auth');
    timerRef.current = setTimeout(async () => {
      try {
        const r = await postHometaxLink({ businessNumber: form.bizNo, consent });
        setResult(r);
        setStep('done');
        onLinked(r.financials);
      } catch (e) {
        setError(e.message);
        setStep('form');
      }
    }, AUTH_MOCK_MS);
  };

  const retry = () => {
    setResult(null);
    setError('');
    setStep('form');
  };

  const f = result?.financials;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#2B2825' }}>
            국세청 홈택스 연동 <span style={{ color: '#8DBB6C', fontSize: 12 }}>선택</span>
          </p>
          <p style={{ fontSize: 12, color: '#A79C8E', marginTop: 3 }}>
            본인인증 후 매출·지출을 자동으로 채워드려요 · 프로토타입은 시뮬레이션 데이터
          </p>
        </div>
        <button className="toggle" style={{ background: step !== 'off' ? '#8DBB6C' : '#E4D8C2' }} onClick={toggle}>
          <span className="knob" style={{ left: step !== 'off' ? 25 : 3 }} />
        </button>
      </div>

      {step === 'form' && (
        <div className="pop" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <p style={{ fontSize: 12, color: '#8A8178', lineHeight: 1.6 }}>
            홈택스 자료 조회에는 <b style={{ color: '#2B2825' }}>사업자등록번호</b>와{' '}
            <b style={{ color: '#2B2825' }}>대표자 본인인증</b>이 필요해요.
          </p>
          <div className="input-row warm">
            <span className="k" style={{ width: 92 }}>사업자등록번호</span>
            <input value={form.bizNo} onChange={(e) => set({ bizNo: fmtBizNo(e.target.value) })}
              placeholder="000-00-00000" inputMode="numeric" style={{ fontSize: 14, letterSpacing: .3 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-row warm" style={{ flex: 1.2 }}>
              <span className="k" style={{ fontSize: 12 }}>대표자명</span>
              <input value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })}
                placeholder="홍길동" style={{ fontSize: 14 }} />
            </div>
            <div className="input-row warm" style={{ flex: 1 }}>
              <span className="k" style={{ fontSize: 12 }}>생년월일</span>
              <input value={form.birth} onChange={(e) => set({ birth: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="880101" inputMode="numeric" style={{ fontSize: 14, width: 60 }} />
            </div>
          </div>
          <div className="input-row warm">
            <span className="k" style={{ width: 92 }}>휴대폰 번호</span>
            <input value={form.phone} onChange={(e) => set({ phone: fmtPhone(e.target.value) })}
              placeholder="010-0000-0000" inputMode="numeric" style={{ fontSize: 14, letterSpacing: .3 }} />
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#8A8178', marginTop: 2 }}>간편인증 수단 선택</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {CERTS.map((c) => (
              <button key={c.id} onClick={() => set({ cert: c.id })} style={{
                border: form.cert === c.id ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
                background: form.cert === c.id ? '#FFF6DD' : '#fff',
                borderRadius: 11, padding: '9px 2px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: c.chipBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 900, color: c.chipColor }}>{c.chip}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#2B2825' }}>{c.name}</span>
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: '#8A8178', lineHeight: 1.6, cursor: 'pointer' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, flex: 'none' }} />
            <span>
              <b style={{ color: '#2B2825' }}>[필수]</b> 부가세 신고 매출·매입 세금계산서·원천세(인건비)·임대료 자료를{' '}
              <b style={{ color: '#2B2825' }}>진단 목적에 한해</b> 조회하며 서버에 저장하지 않습니다.
              동의하지 않으면 직접 입력으로 이용할 수 있어요.
            </span>
          </label>

          <button onClick={requestAuth} disabled={!valid || !consent} style={{
            width: '100%', height: 44, border: 'none', borderRadius: 13,
            background: valid && consent ? '#FFBC00' : '#EFE6D4',
            color: valid && consent ? '#2B2825' : '#C4BAAD',
            fontSize: 14, fontWeight: 900, cursor: valid && consent ? 'pointer' : 'default',
          }}>
            {valid ? (consent ? '간편인증 요청하기' : '정보 제공에 동의해 주세요') : '정보를 모두 입력해 주세요'}
          </button>
          {error && <p style={{ fontSize: 12, color: '#D0564C', fontWeight: 600 }}>{error}</p>}
        </div>
      )}

      {step === 'auth' && (
        <div className="pop" style={{ background: '#FBF7EE', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="spinner" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#2B2825' }}>{certName} 인증을 기다리고 있어요</p>
            <p style={{ fontSize: 11.5, color: '#A79C8E', marginTop: 2 }}>
              휴대폰에서 인증을 완료해 주세요 · 프로토타입은 자동 완료돼요
            </p>
          </div>
        </div>
      )}

      {step === 'done' && f && (
        <div className="pop" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ background: '#EDF5E1', borderRadius: 12, padding: '10px 13px', display: 'flex', gap: 9, alignItems: 'center' }}>
            <span style={{ flex: 'none', width: 18, height: 18, background: '#8DBB6C', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 10 }}>✓</span>
            <p style={{ fontSize: 12.5, color: '#5E6E4A', fontWeight: 600 }}>
              {certName} 인증이 완료됐어요! {f.maskedBusinessNumber} · {f.basisPeriod} 자료를 불러와 아래에 채웠어요.
            </p>
          </div>
          <div style={{ background: '#FBF7EE', borderRadius: 12, padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row k="월평균 매출" v={fmtMan(f.monthlySalesAvg)} strong />
            <Row k="· 매입(재료비)" v={fmtMan(f.purchaseCost)} />
            <Row k="· 인건비" v={fmtMan(f.laborCost)} />
            <Row k="· 임대료" v={fmtMan(f.rent)} />
            <Row k="· 기타" v={fmtMan(f.otherExpense)} />
            <Row k="월평균 지출 합계" v={fmtMan(f.totalMonthlyExpense)} strong />
          </div>
          <button onClick={retry} style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', color: '#B08A2E',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0,
          }}>다시 불러오기</button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 13 : 12 }}>
      <span style={{ color: strong ? '#2B2825' : '#8A8178', fontWeight: strong ? 800 : 500 }}>{k}</span>
      <span style={{ fontWeight: strong ? 900 : 700, color: strong ? '#2B2825' : '#6B6259' }}>{v}</span>
    </div>
  );
}
