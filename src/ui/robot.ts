/** 2D cartoon robot. Same state vocabulary as the fly, deliberately angular
 *  where the fly is round, so the two read as different kinds of thing. */
import type { AgentState } from '../opponents/types';

export function drawRobot(el: HTMLElement, state: AgentState) {
  const lit = state === 'think' ? '#7fe3d4' : state === 'happy' ? '#8fe07a'
            : state === 'sad' ? '#e88a6a' : state === 'nap' ? '#3d5a63' : '#7fc6e3';
  const blink = state === 'think' ? '.45s' : state === 'nap' ? '2.4s' : '0s';
  const closed = state === 'nap';
  const mouth = state === 'happy' ? 'M44,62 Q56,70 68,62'
              : state === 'sad'   ? 'M44,66 Q56,58 68,66'
              : state === 'shrug' ? 'M46,64 L60,64' : 'M45,64 L67,64';
  const tilt = state === 'think' ? -6 : state === 'shrug' ? 5 : 0;
  const eyes = closed
    ? `<path d="M40,44 L52,44 M60,44 L72,44" stroke="${lit}" stroke-width="3.4" stroke-linecap="round"/>`
    : `<rect x="39" y="38" width="14" height="12" rx="3" fill="${lit}"/>
       <rect x="59" y="38" width="14" height="12" rx="3" fill="${lit}"/>
       <rect x="42" y="41" width="4" height="4" rx="1" fill="#0d1f24" opacity=".55"/>
       <rect x="62" y="41" width="4" height="4" rx="1" fill="#0d1f24" opacity=".55"/>`;
  el.innerHTML = `
  <svg viewBox="0 0 112 92" width="100%" height="100%" role="img" aria-label="robot">
    <ellipse cx="56" cy="85" rx="24" ry="4" fill="rgba(0,0,0,.13)"/>
    <g transform="rotate(${tilt} 56 56)">
      <line x1="56" y1="22" x2="56" y2="14" stroke="#4a6b74" stroke-width="3"/>
      <circle cx="56" cy="11" r="4.5" fill="${lit}">
        ${blink !== '0s' ? `<animate attributeName="opacity" values="1;.25;1" dur="${blink}" repeatCount="indefinite"/>` : ''}
      </circle>
      <rect x="26" y="22" width="60" height="52" rx="11" fill="#35525a"/>
      <rect x="30" y="26" width="52" height="34" rx="8" fill="#1d343b"/>
      ${eyes}
      <path d="${mouth}" stroke="#9fd8e4" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <rect x="18" y="38" width="7" height="18" rx="3" fill="#4a6b74"/>
      <rect x="87" y="38" width="7" height="18" rx="3" fill="#4a6b74"/>
      ${state === 'think' ? `<g fill="#5d757e">
        <circle cx="92" cy="24" r="2.4"><animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite"/></circle>
        <circle cx="99" cy="16" r="3.2"><animate attributeName="opacity" values="0;1;0" dur="1s" begin=".25s" repeatCount="indefinite"/></circle></g>` : ''}
      ${closed ? `<text x="90" y="22" font-size="12" fill="#5d757e" font-family="sans-serif">z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></text>` : ''}
    </g>
  </svg>`;
}
