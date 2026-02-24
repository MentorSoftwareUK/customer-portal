SRC = 'apps/api/src/jobs/emailWorker.ts'

with open(SRC, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

# Remove lines 91-128 (0-indexed), i.e. the orphaned old buildText body
# Line 91 (0-indexed) = "  if (params.job.type === 'event_confirmation') {"
# Line 128 (0-indexed) = "}"
new_lines = lines[:91] + lines[129:]

with open(SRC, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print(f'Done. Total lines: {len(new_lines)}')
