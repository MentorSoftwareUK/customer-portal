SRC = 'apps/api/src/jobs/emailWorker.ts'

with open(SRC, 'r', encoding='utf-8') as f:
    content = f.read()

# Print lines 85-135 to see exactly what's there
lines = content.split('\n')
for i, l in enumerate(lines[84:135], start=85):
    print(f'{i}: {repr(l)}')
