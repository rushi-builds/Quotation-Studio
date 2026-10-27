/* Original, export-safe two-tone proposal marks. Never substitutes company logos. */
'use strict';
(function(root){
 const palettes={warm:{accent:'#b77d40',tint:'#fbf0e1'},sage:{accent:'#668d80',tint:'#edf4f0'},lavender:{accent:'#8b7ba7',tint:'#f2eef8'},blue:{accent:'#648ca8',tint:'#edf3f8'}};
 const shapes={
  target:'<circle cx="14" cy="18" r="10" fill="{t}"/><circle cx="14" cy="18" r="6" stroke="{a}"/><circle cx="14" cy="18" r="2" fill="{a}" stroke="none"/><path d="m15 17 12-12m-6 0h6v6" stroke="{a}"/>',
  coins:'<ellipse cx="12" cy="8" rx="8" ry="3" fill="{t}"/><path d="M4 8v7c0 2 3.6 3 8 3M4 12c0 2 3.6 3 8 3M20 8v3"/><ellipse cx="21" cy="17" rx="7" ry="3" fill="{t}" stroke="{a}"/><path d="M14 17v7c0 2 3 3 7 3s7-1 7-3v-7M14 21c0 2 3 3 7 3s7-1 7-3" stroke="{a}"/>',
  calendar:'<rect x="5" y="7" width="22" height="21" rx="4" fill="{t}"/><path d="M5 13h22M11 4v6M21 4v6"/><path d="M11 18h2m6 0h2m-10 5h2m6 0h2" stroke="{a}" stroke-width="2.2"/>',
  payment:'<rect x="3" y="7" width="26" height="19" rx="4" fill="{t}"/><path d="M3 13h26" stroke="{a}" stroke-width="2.3"/><path d="M8 21h6"/><rect x="21" y="18" width="4" height="4" rx="1" fill="{a}" stroke="none"/>',
  truck:'<path d="M4 8h15v15H4Z" fill="{t}"/><path d="M19 13h6l4 6v4H19Z" fill="{t}"/><path d="M21 14v5h7" stroke="{a}"/><circle cx="9" cy="24" r="3" fill="#fff"/><circle cx="24" cy="24" r="3" fill="#fff"/><path d="M8 13h7" stroke="{a}"/>',
  institution:'<path d="m3 11 13-8 13 8Z" fill="{t}"/><path d="M5 26h22M3 29h26M7 14v9M13 14v9M19 14v9M25 14v9"/><path d="M10 10h12" stroke="{a}"/>',
  meter:'<circle cx="16" cy="16" r="12" fill="{t}"/><path d="M8 19a9 9 0 0 1 16 0" stroke="{a}"/><path d="m16 18 6-7M16 5v2M7 11l2 1M25 11l-2 1"/><circle cx="16" cy="18" r="2" fill="{a}" stroke="none"/>',
  shield:'<path d="m16 3-11 4v9c0 6 4 10 11 13 7-3 11-7 11-13V7Z" fill="{t}"/><path d="m10.5 16 4 4 7-8" stroke="{a}" stroke-width="2"/>',
  exclusion:'<path d="M7 3h12l6 6v18H7Z" fill="{t}"/><path d="M18 3v7h7M11 14h8M11 19h5"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="{a}"/><path d="M21 24h6" stroke="{a}"/>',
  tax:'<path d="M7 3h12l6 6v20H7Z" fill="{t}"/><path d="M18 3v7h7"/><circle cx="12.5" cy="15" r="1.5" stroke="{a}"/><circle cx="19.5" cy="23" r="1.5" stroke="{a}"/><path d="m12 24 8-10" stroke="{a}"/>',
  shieldAlert:'<path d="m16 3-11 4v9c0 6 4 10 11 13 7-3 11-7 11-13V7Z" fill="{t}"/><path d="M16 10v8M16 22v.2" stroke="{a}" stroke-width="2.2"/>',
  scales:'<path d="M16 4v23M10 29h12M5 9h22"/><path d="m8 9-5 11h10L8 9Zm16 0-5 11h10L24 9Z" fill="{t}"/><path d="M3 20c0 5 10 5 10 0M19 20c0 5 10 5 10 0" stroke="{a}"/><circle cx="16" cy="7" r="2" fill="{a}" stroke="none"/>',
  leaf:'<path d="M7 26C3 15 12 6 27 4c0 16-7 23-20 22Z" fill="{t}"/><path d="M5 29c4-9 9-15 17-20M12 17l1 7M17 12l7 1" stroke="{a}"/>',
  users:'<circle cx="16" cy="10" r="4" fill="{t}"/><path d="M8 28v-3a8 8 0 0 1 16 0v3" fill="{t}"/><path d="M6 9a3 3 0 0 0 0 6M26 9a3 3 0 0 1 0 6M3 25v-2a5 5 0 0 1 3-4M29 25v-2a5 5 0 0 0-3-4" stroke="{a}"/>',
  chart:'<path d="M4 4v24h25"/><rect x="9" y="17" width="4" height="7" rx="1" fill="{t}"/><rect x="16" y="12" width="4" height="12" rx="1" fill="{t}"/><rect x="23" y="6" width="4" height="18" rx="1" fill="{t}" stroke="{a}"/>',
  doc:'<path d="M7 3h12l6 6v20H7Z" fill="{t}"/><path d="M18 3v7h7M11 15h10M11 20h10"/><path d="M11 25h6" stroke="{a}"/>',
  sun:'<circle cx="16" cy="16" r="7" fill="{t}" stroke="{a}"/><path d="M16 2v3M16 27v3M2 16h3M27 16h3M6 6l2 2M24 24l2 2M6 26l2-2M24 8l2-2"/>',
  rupee:'<circle cx="16" cy="16" r="13" fill="{t}" stroke="{a}"/><path d="M10 8h12M10 13h12M17 8c4 7-1 9-7 9l10 9"/>',
  wrench:'<path d="M20 4a7 7 0 0 0-8 9L4 21a4 4 0 0 0 6 6l8-8a7 7 0 0 0 9-9l-5 5-5-5 5-5Z" fill="{t}"/><path d="m7 24 7-7" stroke="{a}"/>',
  check:'<circle cx="16" cy="16" r="13" fill="{t}"/><path d="m9 16 5 5 9-11" stroke="{a}" stroke-width="2"/>',
  gear:'<path d="m13 3 6 0 1 4 4 2 4-1 3 5-3 3 0 4 3 3-3 5-4-1-4 2-1 4h-6l-1-4-4-2-4 1-3-5 3-3v-4l-3-3 3-5 4 1 4-2Z" transform="translate(0 -2) scale(.95)" fill="{t}"/><circle cx="15" cy="15" r="5" stroke="{a}"/>'
 };
 function get(name,size=28,palette='warm'){
  const p=Object.hasOwn(palettes,palette)?palettes[palette]:palettes.warm;
  const body=(Object.hasOwn(shapes,name)?shapes[name]:shapes.doc).replaceAll('{a}',p.accent).replaceAll('{t}',p.tint);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+Number(size)+'" height="'+Number(size)+'" viewBox="0 0 32 32" fill="none" stroke="#28465f" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
 }
 root.ProposalMarks={get};
})(window);
