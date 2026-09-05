import sys
content = open('index.html', 'r', encoding='utf-8').read()
print('categories:', 'db.ref(\'categories\')' in content or 'db.ref("categories")' in content)
print('products:', 'db.ref(\'products\')' in content or 'db.ref("products")' in content)
