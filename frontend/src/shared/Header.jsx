export default function Header({ title, screen, onBack }) {
  return (
    <div className="hdr">
      <button className="hdr-back" onClick={onBack}>‹</button>
      <span className="hdr-title">{title}</span>
      <div className="hdr-dots">
        {[1, 2, 3, 4].map((n, i) => (
          <span key={i} className="dot" style={{
            width: n === screen ? 14 : 6,
            background: n === screen ? '#FFBC00' : n < screen ? '#E8D9B8' : '#EFE6D4',
          }} />
        ))}
      </div>
    </div>
  );
}
