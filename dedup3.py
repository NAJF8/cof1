import re
text = open('index.html', 'r', encoding='utf-8').read()
pattern = r"document\.getElementById\('giftForm'\)\?\.addEventListener\('submit',async event=>\{.*?refreshGiftPayment\(\).*?\}"
matches = list(re.finditer(pattern, text, re.DOTALL))
print("Found matches:", len(matches))

best_match = None
for m in matches:
    if 'read-back' in m.group(0):
        best_match = m.group(0)

if best_match and len(matches) > 1:
    text = re.sub(pattern, "", text, flags=re.DOTALL)
    idx = text.find('if (!db)')
    if idx != -1:
        text = text[:idx] + best_match + '\n' + text[idx:]
        open('index.html', 'w', encoding='utf-8').write(text)
        print("Fixed and deduplicated!")
