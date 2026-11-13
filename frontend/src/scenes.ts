// Illustrated "photo" scenes, ported from the UI mockup. Each call returns an SVG string with unique ids.
const P: Record<string, string[]> = {
  sunset: ["#1c2333", "#5a4a5e", "#e08a4f", "#ffd9a0", "#2b3442", "#1a212c", "#0b0f15"],
  lake: ["#16202e", "#3d5873", "#d99a62", "#ffe0b0", "#22303f", "#141c26", "#080b10"],
  bamboo: ["#141d18", "#3c5546", "#c9a46a", "#fbe7c0", "#24352b", "#16211b", "#0a0f0c"],
  night: ["#0b0f1a", "#1c2740", "#4a5a7d", "#f2e6cf", "#1a2234", "#10151f", "#06080d"],
  pagoda: ["#1a1d26", "#4f4652", "#d6844f", "#ffd8a4", "#2a2b33", "#191a20", "#0b0b0f"],
  tokyo: ["#121826", "#3a4560", "#c97b5a", "#ffd2a6", "#222a3a", "#151a26", "#07090e"],
  osaka: ["#151924", "#4a4a5c", "#d98a55", "#ffe0b0", "#2a2c38", "#1a1b24", "#0a0a0f"],
  dubai: ["#1d1a22", "#6b4a4a", "#e39a55", "#ffe6b8", "#8a5d3a", "#5a3b25", "#22150c"],
  abudhabi: ["#152030", "#4a6580", "#e0a874", "#fff0d6", "#b88a5e", "#7a5a3c", "#241a10"],
};
let n = 0;

export function scene(k: string): string {
  if (k === "fjord") return fjord();
  const c = P[k] ?? P.sunset;
  n++;
  const id = "s" + n;
  let extra = "";
  if (k === "bamboo") for (let i = 0; i < 14; i++) { const x = i * 15 + Math.sin(i) * 6; extra += `<rect x="${x}" y="0" width="${3 + (i % 3)}" height="200" fill="${c[5]}" opacity="${0.5 + ((i * 7) % 5) / 10}"/><rect x="${x - 1}" y="${40 + ((i * 23) % 90)}" width="${5 + (i % 3)}" height="2" fill="${c[6]}"/>`; }
  if (k === "night" || k === "pagoda") for (let i = 0; i < 9; i++) { const x = 20 + i * 21, y = 58 + (i % 3) * 9; extra += `<line x1="${x}" y1="0" x2="${x}" y2="${y - 6}" stroke="${c[6]}" stroke-width=".6"/><ellipse cx="${x}" cy="${y}" rx="5" ry="6.5" fill="#ffb36b" filter="url(#bl${id})"/><ellipse cx="${x}" cy="${y}" rx="3.6" ry="5" fill="#ffd9a0"/>`; }
  let stars = "";
  if (k === "night") for (let i = 0; i < 40; i++) stars += `<circle cx="${(i * 47) % 200}" cy="${(i * 29) % 70}" r="${(i % 3) * 0.25 + 0.3}" fill="#fff" opacity="${0.3 + (i % 5) / 8}"/>`;
  const pagoda = `<g fill="${c[6]}"><rect x="146" y="58" width="2.4" height="14"/><path d="M128 74h38l-6 5h-26z"/><rect x="136" y="79" width="22" height="9"/><path d="M124 88h46l-7 5h-32z"/><rect x="133" y="93" width="28" height="10"/><path d="M120 103h54l-8 6h-38z"/><rect x="130" y="109" width="34" height="13"/><path d="M116 122h62l-9 6h-44z"/><rect x="127" y="128" width="40" height="60"/></g>`;
  const torii = `<g fill="${c[6]}"><path d="M22 116q40-8 80 0v6q-40-7-80 0z"/><rect x="28" y="128" width="68" height="4"/><rect x="36" y="118" width="5" height="70"/><rect x="83" y="118" width="5" height="70"/></g>`;
  let city = "";
  const d = c[6];
  if (k === "tokyo") city = `<g fill="${d}">${[[8, 40], [22, 62], [34, 30], [48, 70], [60, 46], [74, 84], [90, 38], [104, 58], [120, 28], [150, 66], [166, 44], [180, 74], [192, 36]].map(([x, h]) => `<rect x="${x}" y="${180 - h}" width="13" height="${h}"/>`).join("")}<path d="M134 180 L139 72 L141 72 L146 180Z"/><path d="M130 180 L140 110 L150 180Z" opacity=".9"/><rect x="137" y="100" width="6" height="4"/><rect x="139.4" y="56" width="1.2" height="16"/></g>${[...Array(40)].map((_, i) => `<rect x="${(i * 37) % 196}" y="${120 + ((i * 13) % 56)}" width="1.6" height="1.6" fill="#ffd36b" opacity="${0.4 + (i % 4) / 6}"/>`).join("")}`;
  if (k === "osaka") city = `<g fill="${d}"><path d="M60 180 V150 H140 V180Z"/><path d="M70 150 L72 140 H128 L130 150Z"/><rect x="78" y="124" width="44" height="16"/><path d="M70 124 Q100 112 130 124Z"/><rect x="84" y="106" width="32" height="14"/><path d="M78 106 Q100 94 122 106Z"/><rect x="90" y="88" width="20" height="12"/><path d="M84 88 Q100 76 116 88Z"/><path d="M95 78 l5 -6 l5 6z"/></g><g fill="${c[3]}" opacity=".7">${[0, 1, 2, 3, 4].map((i) => `<rect x="${84 + i * 7}" y="128" width="3" height="5"/>`).join("")}</g>`;
  if (k === "dubai") city = `<g fill="${d}"><path d="M97 180 L99 40 L101 40 L103 180Z"/><path d="M92 180 L98 80 L104 80 L110 180Z" opacity=".95"/><path d="M88 180 L97 120 L106 120 L114 180Z"/><rect x="99.5" y="18" width="1" height="24"/>${[[20, 40], [34, 58], [48, 34], [130, 52], [146, 70], [162, 38], [178, 60]].map(([x, h]) => `<rect x="${x}" y="${180 - h}" width="11" height="${h}" rx="1"/>`).join("")}<path d="M60 180 Q66 120 74 180Z"/></g>`;
  if (k === "abudhabi") city = `<g fill="${d}"><rect x="40" y="148" width="120" height="32"/><path d="M76 148 Q100 104 124 148Z"/><path d="M52 150 Q62 132 72 150Z"/><path d="M128 150 Q138 132 148 150Z"/><rect x="99.4" y="110" width="1.2" height="10"/><rect x="34" y="96" width="5" height="84"/><rect x="161" y="96" width="5" height="84"/><path d="M33 96 l3.5 -10 l3.5 10z"/><path d="M160 96 l3.5 -10 l3.5 10z"/></g>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${50 + i * 15} 180 v-14 q4 -6 8 0 v14z" fill="${c[3]}" opacity=".35"/>`).join("")}<rect y="180" width="200" height="20" fill="${c[4]}" opacity=".5"/>`;
  const water = k === "lake" ? `<rect y="150" width="200" height="50" fill="${c[4]}" opacity=".9"/>${[...Array(10)].map((_, i) => `<rect x="${20 + i * 17}" y="${156 + (i % 4) * 9}" width="${18 + (i % 3) * 8}" height="1" fill="${c[3]}" opacity=".35"/>`).join("")}<ellipse cx="140" cy="158" rx="16" ry="2" fill="${c[3]}" opacity=".5"/>` : "";
  const isNight = k === "night";
  return `<svg class="sc" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"><defs>
 <linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset=".85" stop-color="${c[2]}"/></linearGradient>
 <radialGradient id="sun${id}"><stop offset="0" stop-color="${c[3]}"/><stop offset=".35" stop-color="${c[3]}" stop-opacity=".85"/><stop offset="1" stop-color="${c[2]}" stop-opacity="0"/></radialGradient>
 <linearGradient id="hz${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[2]}" stop-opacity="0"/><stop offset="1" stop-color="${c[2]}" stop-opacity=".55"/></linearGradient>
 <filter id="bl${id}"><feGaussianBlur stdDeviation="2.4"/></filter>
 <filter id="gr${id}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .14 0"/></filter></defs>
 <rect width="200" height="200" fill="url(#sky${id})"/>${stars}
 <circle cx="${isNight ? 150 : 136}" cy="${isNight ? 34 : 96}" r="${isNight ? 16 : 46}" fill="url(#sun${id})"/>
 ${isNight ? `<circle cx="150" cy="34" r="8" fill="#fff4fb"/>` : `<circle cx="136" cy="96" r="13" fill="${c[3]}" opacity=".95"/>`}
 <path d="M0 118 C30 96 50 104 74 92 S120 80 140 98 S180 92 200 100 V200 H0Z" fill="${c[4]}" opacity=".55" filter="url(#bl${id})"/>
 <path d="M0 136 C26 122 46 128 70 116 S112 112 132 124 S176 116 200 126 V200 H0Z" fill="${c[4]}"/>
 <rect y="110" width="200" height="40" fill="url(#hz${id})"/>
 <path d="M0 158 C30 146 60 152 90 142 S150 140 200 150 V200 H0Z" fill="${c[5]}"/>
 ${water}${city}${k === "sunset" ? torii : ""}${k === "pagoda" || k === "sunset" ? pagoda : ""}${extra}
 ${isNight ? pagoda : ""}
 ${city ? "" : `<path d="M0 180 C50 172 120 178 200 170 V200 H0Z" fill="${c[6]}"/>`}<rect y="180" width="200" height="20" fill="${c[6]}" opacity="${city ? 1 : 0}"/>
 <rect width="200" height="200" filter="url(#gr${id})" opacity=".9"/>
 <rect width="200" height="200" fill="url(#sun${id})" opacity=".12"/></svg>`;
}

export function fjord(vb?: string): string {
  n++;
  const id = "f" + n;
  return `<svg class="sc" viewBox="${vb || "0 0 400 240"}" preserveAspectRatio="xMidYMid slice"><defs>
<linearGradient id="sk${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2433"/><stop offset=".45" stop-color="#6b5a62"/><stop offset=".75" stop-color="#e3965a"/><stop offset="1" stop-color="#f7cf95"/></linearGradient>
<radialGradient id="sn${id}" cx="236" cy="96" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3d6"/><stop offset=".12" stop-color="#ffd79a" stop-opacity=".95"/><stop offset=".5" stop-color="#e98f4c" stop-opacity=".35"/><stop offset="1" stop-color="#e98f4c" stop-opacity="0"/></radialGradient>
<linearGradient id="wt${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6f7f"/><stop offset=".5" stop-color="#25384a"/><stop offset="1" stop-color="#0d1822"/></linearGradient>
<linearGradient id="mt${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a313d"/><stop offset=".7" stop-color="#3d3b44"/><stop offset="1" stop-color="#6a4f45"/></linearGradient>
<filter id="b${id}"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .12 0"/></filter></defs>
<rect width="400" height="240" fill="url(#sk${id})"/>
<g fill="#2a2a36" opacity=".55" filter="url(#b${id})"><ellipse cx="80" cy="30" rx="120" ry="14"/><ellipse cx="250" cy="22" rx="140" ry="12"/><ellipse cx="190" cy="58" rx="110" ry="9" fill="#5a4552"/><ellipse cx="360" cy="48" rx="80" ry="10" fill="#8a5a52"/></g>
<rect width="400" height="240" fill="url(#sn${id})"/><circle cx="236" cy="96" r="9" fill="#fff4dc"/>
<g opacity=".18" fill="#ffe2b0"><path d="M236 96 L120 240 L156 240Z"/><path d="M236 96 L214 240 L238 240Z"/><path d="M236 96 L300 240 L322 240Z"/><path d="M236 96 L20 190 L30 204Z"/></g>
<path d="M0 120 L22 104 L40 112 L58 92 L70 100 L86 84 L100 96 L120 78 L134 90 L150 70 L166 86 L186 72 L204 92 L220 82 L240 100 L262 96 L290 112 L320 108 L350 118 L400 112 V160 H0Z" fill="url(#mt${id})"/>
<g fill="#c9ced8" opacity=".35"><path d="M58 92 L62 97 L56 98Z"/><path d="M86 84 L90 90 L83 91Z"/><path d="M120 78 L124 84 L117 85Z"/><path d="M150 70 L155 78 L147 79Z"/><path d="M186 72 L190 79 L183 79Z"/></g>
<path d="M0 132 L30 118 L52 128 L80 112 L110 126 L130 120 V160 H0Z" fill="#1d232c"/>
<path d="M290 160 L310 120 L330 112 L352 124 L370 104 L400 96 V170Z" fill="#2b2b33"/><path d="M352 124 L370 104 L376 112" stroke="#e9a76a" stroke-width="1.5" fill="none" opacity=".6"/>
<rect y="150" width="400" height="90" fill="url(#wt${id})"/>
<ellipse cx="236" cy="160" rx="60" ry="3" fill="#ffd79a" opacity=".55"/><ellipse cx="230" cy="174" rx="80" ry="2" fill="#ffd79a" opacity=".25"/>
${[...Array(14)].map((_, i) => `<rect x="${30 + ((i * 53) % 340)}" y="${168 + ((i * 11) % 60)}" width="${3 + (i % 4)}" height="1.2" fill="#e6eef5" opacity=".5"/>`).join("")}
<path d="M0 200 L20 190 L44 196 L62 182 L84 190 L100 184 L118 196 L140 194 L150 240 H0Z" fill="#14100e"/>
<path d="M62 182 L84 190 L100 184" stroke="#a46a44" stroke-width="1.2" fill="none" opacity=".7"/>
<g fill="#0c0a09"><rect x="80.5" y="170" width="3.2" height="9" rx="1"/><rect x="80.8" y="178" width="1.3" height="6"/><rect x="82.4" y="178" width="1.3" height="6"/><circle cx="82.1" cy="168" r="2"/><rect x="83.3" y="171" width="2" height="5" rx=".8" fill="#2b3a52"/></g>
<path d="M300 240 L320 210 L350 200 L380 214 L400 206 V240Z" fill="#100c0b"/>
<rect width="400" height="240" filter="url(#g${id})"/></svg>`;
}

/** The scene used for each destination city. */
export const cityScene: Record<string, string> = { Tokyo: "tokyo", Kyoto: "sunset", Osaka: "osaka", Dubai: "dubai", "Abu Dhabi": "abudhabi" };
/** Hotel cards rotate through these so neighbouring cards look different. */
export const hotelScenes = ["pagoda", "night", "lake", "bamboo", "sunset"];
