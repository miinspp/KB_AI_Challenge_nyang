import Couple from './Couple';
import { PRODUCTS } from '../recommend/products';
import { sumEffects } from './sim';

export default function SimulatorScreen({ equipped, toggle, simRows }) {
  const eq = equipped.map((id) => PRODUCTS.find((p) => p.id === id));
  const d = sumEffects(equipped);
  const nice = d.cash >= 0 && d.credit >= 0;

  return (
    <div className="scr" style={{ padding: '0 0 130px', gap: 0 }}>
      <div style={{ padding: '2px 22px 12px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: '#2B2825', letterSpacing: -.4 }}>상품을 장착해 보세요</h2>
        <p style={{ marginTop: 4, fontSize: 12.5, color: '#8A8178' }}>아래 상품을 탭하면 슬롯에 장착되고, 가게 지표가 바뀌어요.</p>
      </div>

      <div style={{
        margin: '0 22px', position: 'relative', height: 230, overflow: 'hidden',
        background: 'linear-gradient(180deg,#FFF3D2 0%,#FFF9EF 68%,#E9F2DB 86%,#D8E8C2 100%)',
        border: '1.5px solid #F0E7D6', borderRadius: 22,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(180deg,#B9D69A,#9DC47B)' }} />
        <Couple nice={nice} />
        <div style={{
          position: 'absolute', right: 16, top: 14, bottom: 14, width: 150,
          background: 'rgba(255,255,255,.72)', border: '1.5px solid #F0E7D6', borderRadius: 16,
          padding: 10, display: 'flex', flexDirection: 'column', gap: 8, backdropFilter: 'blur(3px)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#8A8178', letterSpacing: .3 }}>장착 슬롯 {eq.length}/3</span>
          {[0, 1, 2].map((i) => {
            const p = eq[i];
            return (
              <button key={i} onClick={() => p && toggle(p.id)} style={{
                flex: 1, borderRadius: 12, cursor: p ? 'pointer' : 'default',
                border: p ? '1.5px solid ' + p.iconColor : '1.5px dashed #E4D8C2',
                background: p ? p.iconBg : 'rgba(255,255,255,.5)',
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', textAlign: 'left',
              }}>
                <span className="icon-badge" style={{ width: 24, height: 24, borderRadius: 8, fontSize: 12, background: p ? '#fff' : '#F5EFE3', color: p ? p.iconColor : '#C4BAAD' }}>{p ? p.icon : '+'}</span>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 800, lineHeight: 1.3, color: p ? '#2B2825' : '#C4BAAD' }}>{p ? p.short : '비어있는 슬롯'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ margin: '12px 22px 0', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {simRows.map((m) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 'none', width: 88, fontSize: 12.5, fontWeight: 700, color: '#8A8178' }}>{m.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#B9B0A4', textDecoration: m.strike }}>{m.before}</span>
            <span style={{ fontSize: 12, color: '#C4BAAD' }}>→</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#2B2825' }}>{m.after}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: m.deltaColor, background: m.deltaBg, padding: '3px 9px', borderRadius: 9 }}>{m.delta}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '0 22px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#8A8178', marginBottom: 9 }}>
          보유 아이템 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 탭하여 장착/해제</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PRODUCTS.map((p) => {
            const on = equipped.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)} style={{
                border: on ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
                background: on ? '#FFF6DD' : '#fff',
                borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', minHeight: 52, transition: 'all .2s',
              }}>
                <span className="icon-badge" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 14, background: p.iconBg, color: p.iconColor }}>{p.icon}</span>
                <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800, color: '#2B2825', lineHeight: 1.35 }}>{p.short}</span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: on ? '#C98A00' : '#D8CDBB' }}>{on ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}