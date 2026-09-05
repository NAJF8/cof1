text = open('index.html', 'r', encoding='utf-8').read()
if 'wa_helper.js' not in text:
    idx = text.rfind('</body>')
    if idx != -1:
        text = text[:idx] + '<script src="wa_helper.js"></script>\n' + text[idx:]
        open('index.html', 'w', encoding='utf-8').write(text)
        print("Injected!")
