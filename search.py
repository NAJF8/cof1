with open('index.html', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'giftForm' in line and 'submit' in line:
            print(i+1, line[:100])
