import sys

# admin.html fix
content = open('admin.html', 'r', encoding='utf-8').read()
content = content.replace(
    "const phone=String(gift?.recipientPhone||'').replace(/\D/g,'');",
    "const phone=String(gift?.recipientPhone||'').replace(/\D/g,'').replace(/^0/,'964');"
)
open('admin.html', 'w', encoding='utf-8').write(content)

# index.html fix
content2 = open('index.html', 'r', encoding='utf-8').read()
content2 = content2.replace(
    'const cleanPhone = (settings.whatsapp || "9647800000000").replace(/\D/g, "");',
    'const cleanPhone = (settings.whatsapp || "9647800000000").replace(/\D/g, "").replace(/^0/,\'964\');'
)
content2 = content2.replace(
    'const targetPhone = (settings.roomWhatsapp || settings.whatsapp || "9647800000000").replace(/\D/g, "");',
    'const targetPhone = (settings.roomWhatsapp || settings.whatsapp || "9647800000000").replace(/\D/g, "").replace(/^0/,\'964\');'
)
content2 = content2.replace(
    "const wa=(giftSettings.whatsapp||'').replace(/\D/g,'');",
    "const wa=(giftSettings.whatsapp||'').replace(/\D/g,'').replace(/^0/,'964');"
)
content2 = content2.replace(
    "\",
    "\"
)
open('index.html', 'w', encoding='utf-8').write(content2)

print('Phone formats fixed')
