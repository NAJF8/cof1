text = open('index.html', 'r', encoding='utf-8').read()
if '<script src="wa_helper.js"></script>' not in text:
    text = text.replace('<script src="script.js"></script>', '<script src="wa_helper.js"></script>\n    <script src="script.js"></script>')
    open('index.html', 'w', encoding='utf-8').write(text)
