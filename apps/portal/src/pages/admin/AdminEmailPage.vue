<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <p class="text-xs uppercase tracking-[0.08em] text-gray-600">Email</p>
      <h2 class="text-2xl font-semibold text-gray-900">Email configuration</h2>
      <p class="text-sm text-gray-700">Configure reminder/thank-you timing and templates (UI-only).</p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="ui-surface p-4 shadow-sm">
        <label class="text-sm font-medium">Reminder lead time (hours)</label>
        <input type="number" min="0" class="ui-input mt-2" value="48" />
        <p class="mt-1 text-xs text-white/70">Default: 2 days before event.</p>
      </div>
      <div class="ui-surface p-4 shadow-sm">
        <label class="text-sm font-medium">Thank-you delay (hours)</label>
        <input type="number" min="0" class="ui-input mt-2" value="24" />
        <p class="mt-1 text-xs text-white/70">Default: 24 hours post-event.</p>
      </div>

      <div class="md:col-span-2 ui-surface p-4 shadow-sm">
        <label class="text-sm font-medium">Template management</label>
        <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-white/10 bg-white/5 p-3">
            <div class="text-sm font-semibold">Confirmation</div>
            <div class="mt-1 text-xs text-white/70">Sent immediately after registration</div>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 p-3">
            <div class="text-sm font-semibold">Reminder</div>
            <div class="mt-1 text-xs text-white/70">Sent before event</div>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 p-3">
            <div class="text-sm font-semibold">Thank you</div>
            <div class="mt-1 text-xs text-white/70">Sent after event with recording/materials</div>
          </div>
        </div>
      </div>

      <div class="md:col-span-2 flex items-center justify-end gap-3">
        <button
          class="rounded-lg border border-[#14192d] bg-transparent px-4 py-2 text-sm font-semibold text-[#14192d] hover:bg-[#14192d]/10"
          type="button"
        >
          Send test email
        </button>
        <button
          class="rounded-lg bg-[#14192d] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#0f1530]"
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
