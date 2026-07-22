import bearOwner from '../../assets/simulator/bear-owner-cutout.png';
import rabbitOwner from '../../assets/simulator/rabbit-owner-cutout-v2.png';

function Character({ src, label, variant }) {
  return (
    <div className={`owner-character owner-character--${variant}`} role="img" aria-label={label}>
      <div className="owner-character__motion">
        {/* Transparent body layer: the landscape background stays outside this component. */}
        <img className="owner-character__layer owner-character__body" src={src} alt="" aria-hidden="true" />
        {/* Transparent head-and-ears layer: overlaps the body slightly for a soft rigged idle motion. */}
        <img className="owner-character__layer owner-character__head" src={src} alt="" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function Couple({ nice }) {
  return (
    <div className="owner-couple">
      <div className="owner-couple__characters">
        <Character src={bearOwner} label="곰 사장님" variant="bear" />
        <Character src={rabbitOwner} label="토끼 사장님" variant="rabbit" />
      </div>
      <span className={`owner-couple__label${nice ? ' is-nice' : ''}`}>모모카페 사장님 부부</span>
    </div>
  );
}
