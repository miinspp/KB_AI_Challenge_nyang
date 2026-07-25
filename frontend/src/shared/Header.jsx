export default function Header({ title, screen, onBack }) {
  return (
    <div className="hdr">
      <button className="hdr-back" onClick={onBack}>‹</button>
      <span className="hdr-title">{title}</span>
      <div className="hdr-dots">
        {[1, 2, 3, 4, 5].map((n, i) => (
          <span key={i} className="dot" style={{
            width: n === screen ? 14 : 6,
            background: n === screen ? 'var(--gold)' : n < screen ? '#E8D9B8' : 'var(--border-strong)',
          }} />
        ))}
      </div>
    </div>
  );
}
