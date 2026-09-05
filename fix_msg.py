import sys
with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_default = "const DEFAULT_GIFT_WHATSAPP_MESSAGE='مرحباً 101 COFFEE 🎁\\n\\nأرغب بتأكيد طلب هدية.\\nسأرسل صورة التحويل هنا لتأكيد الهدية.\\n\\nشكراً لكم ☕';"
new_default = "const DEFAULT_GIFT_WHATSAPP_MESSAGE='مرحباً 101 COFFEE 🤍\\nأرغب بتأكيد طلب الهدية وإرسال إثبات التحويل.';"
content = content.replace(old_default, new_default)

old_recip = 'text=`🎁 عندك هدية من 101 COFFEE!\\n\\nأحدهم حب يخلي يومك أحلى ☕❤️\\n\\nالهدية: ${gift.productName||giftFmt(gift.giftValue)}\\nرسالة المُهدي: "${gift.message||\\'—\\'}"\\nكود الاستلام: ${gift.giftCode}\\nصالحة لغاية: ${giftDate(gift.expiresAt)}\\n📍 101 COFFEE${from}`'
new_recip = 'text=`🎁 عندك هدية من 101 COFFEE ❤️\\n\\nأحدهم حب يخلي يومك أحلى ☕❤️\\n\\nالهدية: ${gift.productName||giftFmt(gift.giftValue)}\\nرسالة المُهدي: "${gift.message||\\'—\\'}"\\nكود الاستلام: ${gift.giftCode}\\nصالحة لغاية: ${giftDate(gift.expiresAt)}\\n📍 101 COFFEE${from}`'
content = content.replace(old_recip, new_recip)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('index.html', 'r', encoding='utf-8') as f:
    content2 = f.read()

old_fallback = 'const text=(giftSettings.whatsappMessage||`مرحباً 101 COFFEE 🎁\\n\\nأرغب بتأكيد طلب هدية.\\n\\nرقم الطلب: ${orderCode}\\nاسم المُهدي: ${senderVisible}\\nنوع الهدية: ${giftName}\\nالقيمة: ${giftMoney(total)}\\nاسم المستلم: ${recipientName}\\n\\nتم/سيتم تحويل المبلغ إلى الحساب الموضح في الموقع.\\nسأرسل صورة التحويل هنا لتأكيد الهدية.`);'
new_fallback = 'const text=(giftSettings.whatsappMessage||`مرحباً 101 COFFEE 🤍\\nأرغب بتأكيد طلب الهدية وإرسال إثبات التحويل.\\n\\nرقم الطلب: ${orderCode}\\nاسم المُهدي: ${senderVisible}\\nنوع الهدية: ${giftName}\\nالقيمة: ${giftMoney(total)}\\nاسم المستلم: ${recipientName}`);'
content2 = content2.replace(old_fallback, new_fallback)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content2)

print('Done.')
