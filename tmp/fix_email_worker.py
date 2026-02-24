import re

SRC = 'apps/api/src/jobs/emailWorker.ts'

with open(SRC, 'r') as f:
    lines = f.readlines()

# Find and remove the orphaned old buildText body (lines 91-129, 0-indexed 90-128)
# It starts with an if block for event_confirmation outside any function (after the closing })
# We'll find it by looking for the pattern: line 90 is '}', line 91 starts with blank line then 'if (params.job.type'
# Strategy: find the block between the closing brace of new buildText and 'function retryDelayMs'

new_lines = []
i = 0
skip_until_retry = False
while i < len(lines):
    line = lines[i]
    # Detect the start of the orphaned block
    if (not skip_until_retry
        and i > 0
        and lines[i-1].strip() == '}'
        and line.strip().startswith('if (params.job.type === \'event_confirmation\')')):
        skip_until_retry = True
        i += 1
        continue
    # Detect end of orphaned block
    if skip_until_retry and line.strip().startswith('function retryDelayMs'):
        skip_until_retry = False
        new_lines.append(line)
        i += 1
        continue
    if skip_until_retry:
        i += 1
        continue
    new_lines.append(line)
    i += 1

with open(SRC, 'w') as f:
    f.writelines(new_lines)

print(f'Done. Lines: {len(new_lines)}')
# verify no orphaned block remains
content = ''.join(new_lines)
if 'Joining link will be shared separately' in content:
    print('WARNING: orphaned block still present')
else:
    print('OK: orphaned block removed')
