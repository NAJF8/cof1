import re

text = open('index.html', 'r', encoding='utf-8').read()

pattern = r"document\.getElementById\('giftForm'\)\?\.addEventListener\('submit',async event=>\{.*?refreshGiftPayment\(\);.*?\}"

matches = list(re.finditer(pattern, text, re.DOTALL))
print("Found matches:", len(matches))

if len(matches) > 1:
    # Keep only the FIRST match, which should be the correct one in its proper place, or the LAST one?
    # Wait, the tool inserted a new one at line 4605, and the original was at 4777!
    # Let's remove ALL matches, then insert the new handler EXACTLY where the FIRST match was.
    
    first_start = matches[-1].start() # Let's assume the original one was the last one in the file because 4777 > 4605
    
    # We remove all of them
    for m in reversed(matches):
        text = text[:m.start()] + text[m.end():]
        
    # Re-insert the new handler where the last one was
    new_handler = matches[-1].group(0) # Wait, my new handler was inserted by the tool. Let's see which one is the new one.
    
    # The new one has 'read-back verification failed'
    best_match = None
    for m in matches:
        if 'read-back verification failed' in m.group(0):
            best_match = m.group(0)
            break
            
    if best_match:
        # insert it back at first_start (or rather, the position of the original, which was the second match)
        text = text[:matches[-1].start()] + best_match + text[matches[-1].start():]
        open('index.html', 'w', encoding='utf-8').write(text)
        print("Deduplicated!")
