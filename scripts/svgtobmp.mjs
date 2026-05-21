import sharp from './node_modules/sharp/lib/index.js';
import { readFileSync } from 'fs';

const TRANSPORT_SIZE = 14;
const STATION_SIZE   = 12;

const transportIcons = {
  BUS:   { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`, size: TRANSPORT_SIZE },
  TRAIN: { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>`, size: TRANSPORT_SIZE },
  TRAM:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>`, size: TRANSPORT_SIZE },
};

const stationIcons = {
  HOUSE:      { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`, key: 'house' },
  BRIEFCASE:  { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`, key: 'briefcase' },
  STAR:       { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`, key: 'star' },
  CART:       { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`, key: 'shopping-cart' },
  DUMBBELL:   { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>`, key: 'dumbbell' },
  UTENSILS:   { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`, key: 'utensils' },
  GRADUATION: { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`, key: 'graduation-cap' },
  CROSS:      { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a2 2 0 0 0-2 2v5H5a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h4v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-5h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4V4a2 2 0 0 0-2-2z"/></svg>`, key: 'cross' },
};

async function svgToBitmap(svg, size) {
  const buf = await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .raw()
    .toBuffer();

  const bytesPerRow = Math.ceil(size / 8);
  const rows = [];
  for (let row = 0; row < size; row++) {
    const bytes = [];
    for (let b = 0; b < bytesPerRow; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = b * 8 + bit;
        if (col < size && buf[row * size + col] < 128) {
          byte |= (1 << (7 - bit));
        }
      }
      bytes.push(`0x${byte.toString(16).padStart(2,'0').toUpperCase()}`);
    }
    rows.push('  ' + bytes.join(', '));
  }
  return rows;
}

console.log('// ── Transport icons (' + TRANSPORT_SIZE + 'x' + TRANSPORT_SIZE + ' px) ─────────────────────────────────────────');
console.log('// Generated from Lucide SVGs. 1-bit = black pixel, 0-bit = transparent (white bg).');
for (const [name, { svg, size }] of Object.entries(transportIcons)) {
  const rows = await svgToBitmap(svg, size);
  const bytesPerRow = Math.ceil(size / 8);
  console.log(`\nconst uint8_t ICON_${name}[] PROGMEM = {`);
  console.log(rows.join(',\n'));
  console.log(`};`);
}

console.log('\n// ── Station icons (12x12 px) ─────────────────────────────────────────────────');
for (const [name, { svg, key }] of Object.entries(stationIcons)) {
  const rows = await svgToBitmap(svg, STATION_SIZE);
  console.log(`\n// key: "${key}"`);
  console.log(`const uint8_t SICON_${name}[] PROGMEM = {`);
  console.log(rows.join(',\n'));
  console.log(`};`);
}
