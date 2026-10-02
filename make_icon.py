from PIL import Image, ImageDraw
S = 256
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((28, 20, 228, 236), radius=26, fill=(255, 226, 122, 255))
d.polygon([(228, 236), (228, 176), (168, 236)], fill=(0, 0, 0, 0))
d.polygon([(168, 236), (228, 176), (168, 176)], fill=(236, 196, 70, 255))
for y, x2 in ((80, 196), (120, 196), (160, 130)):
    d.rounded_rectangle((60, y, x2, y + 12), radius=6, fill=(42, 39, 51, 255))
im.save('icon.png')
