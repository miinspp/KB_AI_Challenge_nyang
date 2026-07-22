// 50대 사장님 부부 캐릭터 (CSS 도형) — 고개를 좌우로 천천히 흔들어요
const P = (s) => ({ position: 'absolute', ...s });

function Husband({ mouthH }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="sway" style={{ position: 'relative', width: 62, height: 62, zIndex: 2 }}>
        <div style={P({ left: 4, top: 2, width: 54, height: 54, background: '#FFE3C9', borderRadius: '50%', boxShadow: '0 2px 0 rgba(0,0,0,.04)' })} />
        <div style={P({ left: 4, top: 0, width: 54, height: 22, background: '#8E8A82', borderRadius: '30px 30px 6px 6px' })} />
        <div style={P({ left: 0, top: 12, width: 10, height: 16, background: '#8E8A82', borderRadius: 6 })} />
        <div style={P({ right: 0, top: 12, width: 10, height: 16, background: '#8E8A82', borderRadius: 6 })} />
        <div style={P({ left: 17, top: 24, width: 9, height: 3, background: '#8E8A82', borderRadius: 2 })} />
        <div style={P({ left: 37, top: 24, width: 9, height: 3, background: '#8E8A82', borderRadius: 2 })} />
        <div style={P({ left: 19, top: 28, width: 6, height: 8, background: '#3C332A', borderRadius: '50%' })} />
        <div style={P({ left: 38, top: 28, width: 6, height: 8, background: '#3C332A', borderRadius: '50%' })} />
        <div style={P({ left: 14, top: 38, width: 9, height: 5, background: '#FFBFA6', borderRadius: '50%', opacity: .85 })} />
        <div style={P({ left: 40, top: 38, width: 9, height: 5, background: '#FFBFA6', borderRadius: '50%', opacity: .85 })} />
        <div style={P({ left: 27, top: 38, width: 10, height: mouthH, border: '2.5px solid #A0522D', borderTop: 'none', borderRadius: '0 0 12px 12px' })} />
      </div>
      <div style={{ position: 'relative', width: 52, height: 46, marginTop: -7 }}>
        <div style={P({ left: 6, top: 0, width: 40, height: 42, background: '#FFD873', borderRadius: '14px 14px 11px 11px' })} />
        <div style={P({ left: 13, top: 11, width: 26, height: 28, background: '#7FA95E', borderRadius: '7px 7px 9px 9px' })} />
        <div style={P({ left: -3, top: 4, width: 11, height: 23, background: '#FFD873', borderRadius: 7, transform: 'rotate(14deg)' })} />
        <div style={P({ right: -3, top: 4, width: 11, height: 23, background: '#FFD873', borderRadius: 7, transform: 'rotate(-14deg)' })} />
      </div>
    </div>
  );
}

function Wife({ mouthH }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="sway rev" style={{ position: 'relative', width: 62, height: 62, zIndex: 2 }}>
        <div style={P({ left: 23, top: -6, width: 16, height: 14, background: '#6B6156', borderRadius: '50%' })} />
        <div style={P({ left: 4, top: 2, width: 54, height: 54, background: '#FFE8D2', borderRadius: '50%', boxShadow: '0 2px 0 rgba(0,0,0,.04)' })} />
        <div style={P({ left: 4, top: 0, width: 54, height: 20, background: '#6B6156', borderRadius: '30px 30px 10px 10px' })} />
        <div style={P({ left: 2, top: 10, width: 12, height: 24, background: '#6B6156', borderRadius: 8 })} />
        <div style={P({ right: 2, top: 10, width: 12, height: 24, background: '#6B6156', borderRadius: 8 })} />
        <div style={P({ left: 19, top: 28, width: 6, height: 8, background: '#3C332A', borderRadius: '50%' })} />
        <div style={P({ left: 38, top: 28, width: 6, height: 8, background: '#3C332A', borderRadius: '50%' })} />
        <div style={P({ left: 14, top: 38, width: 9, height: 5, background: '#F9A8A0', borderRadius: '50%', opacity: .9 })} />
        <div style={P({ left: 40, top: 38, width: 9, height: 5, background: '#F9A8A0', borderRadius: '50%', opacity: .9 })} />
        <div style={P({ left: 27, top: 38, width: 10, height: mouthH, border: '2.5px solid #B0564A', borderTop: 'none', borderRadius: '0 0 12px 12px' })} />
      </div>
      <div style={{ position: 'relative', width: 52, height: 46, marginTop: -7 }}>
        <div style={P({ left: 6, top: 0, width: 40, height: 42, background: '#F2B8AC', borderRadius: '14px 14px 11px 11px' })} />
        <div style={P({ left: 13, top: 11, width: 26, height: 28, background: '#FFF3D2', borderRadius: '7px 7px 9px 9px' })} />
        <div style={P({ left: -3, top: 4, width: 11, height: 23, background: '#F2B8AC', borderRadius: 7, transform: 'rotate(14deg)' })} />
        <div style={P({ right: -3, top: 4, width: 11, height: 23, background: '#F2B8AC', borderRadius: 7, transform: 'rotate(-14deg)' })} />
      </div>
    </div>
  );
}

export default function Couple({ nice }) {
  const mouthH = nice ? 9 : 5;
  return (
    <div className="bob" style={{ position: 'absolute', left: 16, bottom: 26, width: 172, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <Husband mouthH={mouthH} />
        <Wife mouthH={mouthH} />
      </div>
      <span style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: '#5E6E4A', background: 'rgba(255,255,255,.75)', padding: '3px 10px', borderRadius: 9 }}>모모카페 사장님 부부</span>
    </div>
  );
}