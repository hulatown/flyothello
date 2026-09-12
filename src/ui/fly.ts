/** 2D cartoon fly. States: idle / think / happy / sad / shrug / nap */
export type FlyState = 'idle' | 'think' | 'happy' | 'sad' | 'shrug' | 'nap';

export function drawFly(el: HTMLElement, state: FlyState) {
  const wing = state === 'think' ? '.06s' : state === 'happy' ? '.09s' : state === 'nap' ? '.5s' : '.16s';
  const eyeY = state === 'sad' ? 40 : 38;
  const closed = state === 'nap';
  const mouth = state === 'happy' ? 'M46,54 Q56,62 66,54'
              : state === 'sad'   ? 'M46,58 Q56,50 66,58' : 'M48,56 L64,56';
  const tilt = state === 'think' ? -8 : state === 'nap' ? 10 : 0;
  const eyes = closed
    ? `<path d="M37,38 Q45,44 53,38 M59,38 Q67,44 75,38" stroke="#d94f3d" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="45" cy="${eyeY}" r="9.5" fill="#d94f3d"/><circle cx="67" cy="${eyeY}" r="9.5" fill="#d94f3d"/>
       <circle cx="42.5" cy="${eyeY - 3}" r="3.2" fill="#fff" opacity=".9"/><circle cx="64.5" cy="${eyeY - 3}" r="3.2" fill="#fff" opacity=".9"/>`;
  el.innerHTML = `
  <svg viewBox="0 0 112 92" width="100%" height="100%" role="img" aria-label="fly">
    <ellipse cx="56" cy="84" rx="26" ry="4" fill="rgba(0,0,0,.13)"/>
    <g transform="translate(0,${state === 'think' ? 2 : 0}) rotate(${tilt} 56 52)">
      <g opacity=".55" fill="#9fd8e4">
        <ellipse cx="34" cy="34" rx="20" ry="10" transform="rotate(-28 34 34)">
          <animate attributeName="ry" values="10;3;10" dur="${wing}" repeatCount="indefinite"/></ellipse>
        <ellipse cx="78" cy="34" rx="20" ry="10" transform="rotate(28 78 34)">
          <animate attributeName="ry" values="10;3;10" dur="${wing}" repeatCount="indefinite"/></ellipse>
      </g>
      <ellipse cx="56" cy="58" rx="24" ry="21" fill="#2e4a50"/>
      <ellipse cx="56" cy="44" rx="21" ry="18" fill="#3b5d64"/>
      ${eyes}
      <path d="${mouth}" stroke="#16282e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M47,27 Q44,17 38,14 M65,27 Q68,17 74,14" stroke="#2e4a50" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${state === 'think' ? `<g fill="#5d757e"><circle cx="88" cy="26" r="2.6"><animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="95" cy="18" r="3.4"><animate attributeName="opacity" values="0;1;0" dur="1.2s" begin=".3s" repeatCount="indefinite"/></circle></g>` : ''}
      ${closed ? `<text x="86" y="24" font-size="13" fill="#5d757e" font-family="sans-serif">z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></text>` : ''}
    </g>
  </svg>`;
}
