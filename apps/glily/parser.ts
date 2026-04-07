import * as fs from 'fs';
import * as path from 'path';
import TextToSVG from 'text-to-svg';

const currentDir = process.cwd();

const fontPath = path.join(currentDir, 'RobotoMono.ttf');
const textToSVG = TextToSVG.loadSync(fontPath);

export function parseToSvg(glilyStr: string): string {
    const instrMatch = glilyStr.match(/^([a-z\.]+)\s*\{\s*(.*?)\s*\}$/);
    
    let title = "GLILY";
    let bodyText = glilyStr;
    let vectorData: string[] = [];

    if (instrMatch) {
        title = instrMatch[1];
        const content = instrMatch[2];
        const parts = content.split(/\s+/);
        bodyText = parts[0];
        if (parts.length > 1) {
            vectorData = parts.slice(1);
        }
    } else {
        // Trim for display if it's just raw GLILY code
        if (bodyText.length > 20) {
            bodyText = bodyText.substring(0, 17) + "...";
        }
    }

    const width = 160;
    const height = 160;
    const padX = 20;
    
    // Outer box
    let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `  <rect width="${width}" height="${height}" rx="12" fill="#121212" stroke="#00ff88" stroke-width="2"/>\n`;
    
    // Title Background
    svg += `  <rect x="0" y="0" width="${width}" height="32" rx="12" fill="#00ff88" opacity="0.15"/>\n`;

    // Title Path (Top center)
    const titleOptions = { x: width/2, y: 22, fontSize: 16, anchor: 'middle baseline', attributes: { fill: '#00ff88' } };
    const titlePath = textToSVG.getPath(title, titleOptions as any);
    svg += `  ${titlePath}\n`;

    // Body Text Path (Middle)
    const bodyOptions = { x: width/2, y: height/2, fontSize: 22, anchor: 'middle baseline', attributes: { fill: '#ffffff' } };
    const bodyPath = textToSVG.getPath(bodyText, bodyOptions as any);
    svg += `  ${bodyPath}\n`;

    // Vector Graphics (Bottom)
    if (vectorData.length > 0) {
        const padding = 20;
        const availableWidth = width - (padding * 2);
        const spacing = vectorData.length > 1 ? availableWidth / (vectorData.length - 1) : 0;
        
        for (let i = 0; i < vectorData.length; i++) {
            const val = vectorData[i];
            let cx = padding;
            if (vectorData.length > 1) {
                cx += i * spacing;
            } else {
                cx = width / 2;
            }
            const cy = height - 30;
            
            if (val === 'x' || val === 'X') {
                svg += `  <line x1="${cx-4}" y1="${cy-4}" x2="${cx+4}" y2="${cy+4}" stroke="#ff4444" stroke-width="2"/>\n`;
                svg += `  <line x1="${cx+4}" y1="${cy-4}" x2="${cx-4}" y2="${cy+4}" stroke="#ff4444" stroke-width="2"/>\n`;
            } else if (val === '1') {
                svg += `  <circle cx="${cx}" cy="${cy}" r="5" fill="#00ff88"/>\n`;
            } else if (val === '0') {
                svg += `  <circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#666666" stroke-width="2"/>\n`;
            } else {
                // If it's a number like 2, 3, etc. or something else
                const valOptions = { x: cx, y: cy+4, fontSize: 12, anchor: 'middle baseline', attributes: { fill: '#aaaaaa' } };
                const valPath = textToSVG.getPath(val, valOptions as any);
                svg += `  ${valPath}\n`;
            }
        }
    } else {
        // Decorative line
        svg += `  <path d="M ${padX} ${height-30} Q ${width/2} ${height-60}, ${width-padX} ${height-30}" fill="none" stroke="#00ff88" stroke-width="2" opacity="0.3"/>\n`;
    }

    svg += `</svg>`;
    return svg;
}

const isMain = typeof require !== 'undefined' && require.main === module;
const isMainESM = typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('parser.ts');

if (isMain || isMainESM) {
    const args = process.argv.slice(2);
    const input = args[0] || "cl.m { e'c''fis''' 0 0 0 x 0 0 1 }";
    const out = parseToSvg(input);
    const outDir = path.join(currentDir, 'output');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }
    const filename = "glyph_" + Date.now() + ".svg";
    fs.writeFileSync(path.join(outDir, filename), out);
    console.log(`Generated SVG glyph for: ${input}\nSaved to output/${filename}`);
}