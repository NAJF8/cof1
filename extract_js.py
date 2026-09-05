import re
text = open('index.html', 'r', encoding='utf-8').read()
matches = re.findall(r'<script>(.*?)</script>', text, re.DOTALL)
for i, js in enumerate(matches):
    open(f'test_js_{i}.js', 'w', encoding='utf-8').write(js)
