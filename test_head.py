import subprocess
import sys
content = subprocess.check_output(['git', 'show', 'HEAD:index.html']).decode('utf-8', 'ignore')
idx = content.find('db.ref')
sys.stdout.buffer.write(content[idx:idx+1000].encode('utf-8'))
