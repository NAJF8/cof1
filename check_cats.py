import subprocess
import sys

def check(ref):
    print("Checking", ref)
    content = subprocess.check_output(['git', 'show', ref]).decode('utf-8', 'ignore')
    print('categories:', 'db.ref(\'categories\')' in content or 'db.ref("categories")' in content)
    print('products:', 'db.ref(\'products\')' in content or 'db.ref("products")' in content)

check('HEAD:index.html')
check('504a6b3533e6fbd21e76138cffb14e22cd334cfd')
