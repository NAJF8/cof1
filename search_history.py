import os

history_dir = os.path.expandvars(r'%APPDATA%\Code\User\History')
found = False
if os.path.exists(history_dir):
    for root, dirs, files in os.walk(history_dir):
        for f in files:
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                if 'giftForm' in content and 'html' in content:
                    print('FOUND:', path)
                    found = True
            except:
                pass
if not found:
    print('Not found')
