import cairosvg, io
from PIL import Image

icons = {
    'bus': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>',
    'train': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>',
    'tram': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>',
}

SIZE = 12

for name, svg in icons.items():
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=SIZE, output_height=SIZE, background_color='black')
    img = Image.open(io.BytesIO(png)).convert('L')
    pixels = list(img.getdata())

    print(f"\n// {name.upper()} icon ({SIZE}x{SIZE}, Lucide)")
    print(f"const uint8_t ICON_{name.upper()}[] PROGMEM = {{")
    rows = []
    for row in range(SIZE):
        b0, b1 = 0, 0
        for col in range(8):
            if pixels[row * SIZE + col] > 64:
                b0 |= (1 << (7 - col))
        for col in range(4):
            if pixels[row * SIZE + 8 + col] > 64:
                b1 |= (1 << (7 - col))
        rows.append(f"  0x{b0:02X}, 0x{b1:02X}")
    print(',\n'.join(rows))
    print("};")
