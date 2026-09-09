import zlib, struct, os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def make_png(path, size, bg, fg):
    raw = bytearray()
    cx = cy = size / 2.0
    r = size * 0.34
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            dx, dy = x - cx, y - cy
            col = fg if (dx*dx + dy*dy) <= r*r else bg
            raw += bytes(col)
    comp = zlib.compress(bytes(raw), 9)
    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', comp)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

bg = (255, 153, 204)   # #ff99cc 粉
fg = (255, 255, 255)   # 白
make_png(os.path.join(OUT, 'icon-192.png'), 192, bg, fg)
make_png(os.path.join(OUT, 'icon-512.png'), 512, bg, fg)
print("icons written:", os.path.getsize(os.path.join(OUT, 'icon-192.png')),
      os.path.getsize(os.path.join(OUT, 'icon-512.png')))
