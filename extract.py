import re

with open('transcript_hit.txt', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's just print lines containing 'giftForm' and '<' to see if there is HTML
for line in text.splitlines():
    if 'giftForm' in line and '<' in line:
        idx = line.find('giftForm')
        print(line[max(0, idx-100):min(len(line), idx+100)])
