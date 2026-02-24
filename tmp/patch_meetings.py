filepath = '/Users/liamkotecha/Documents/mentor-cp/apps/portal/src/pages/MeetingsPage.vue'
with open(filepath, 'r') as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if 'showNewMeetingModal' in line and 'fixed inset-0' in line and start is None:
        start = i
    if start is not None and 'showMeetingDetails && selectedMeeting' in line and 'fixed inset-0' in line:
        end = i
        break

print(f'Block: lines {start+1} to {end} (0-indexed {start} to {end-1})')

new_modal = '''  <!-- New meeting modal -->
  <div v-if="showNewMeetingModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="closeNewMeeting">
    <!-- Step 1: pick a host -->
    <div v-if="newMeetingStep === \'pick-host\'" class="w-full max-w-md rounded-2xl border border-white/10 bg-[#14192d] p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-white">Schedule a meeting</h2>
          <p class="mt-1 text-sm text-white/60">Who would you like to meet with?</p>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" @click="closeNewMeeting" aria-label="Close">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="mt-5 space-y-3">
        <button
          v-for="host in HOSTS"
          :key="host.key"
          type="button"
          class="flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-white/30 hover:bg-white/10"
          @click="pickHost(host.key)"
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
            {{ host.name.charAt(0) }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-white">{{ host.name }}</div>
            <div class="mt-0.5 flex items-center gap-2">
              <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="host.accent">{{ host.team }}</span>
              <span v-if="host.hasPublicCalendar" class="text-xs text-green-400">Book online</span>
              <span v-else class="text-xs text-white/40">Invite only</span>
            </div>
          </div>
          <svg class="h-5 w-5 shrink-0 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>

    <!-- Step 2: calendar embed or invite-only message -->
    <div v-else-if="newMeetingStep === \'calendar\' && selectedHostDetails" class="w-full rounded-2xl border border-white/10 bg-[#14192d] shadow-xl" :class="selectedHostDetails.hasPublicCalendar ? \'max-w-3xl\' : \'max-w-md\'">
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div class="flex items-center gap-3">
          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" @click="newMeetingStep = \'pick-host\'" aria-label="Back">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div class="text-sm font-semibold text-white">{{ selectedHostDetails.name }}</div>
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold" :class="selectedHostDetails.accent">{{ selectedHostDetails.team }}</span>
          </div>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" @click="closeNewMeeting" aria-label="Close">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <!-- HubSpot calendar embed (Simone) -->
      <div v-if="selectedHostDetails.hasPublicCalendar && selectedHostDetails.calendarSlug" class="p-0">
        <iframe
          :src="`https://meetings-${selectedHostDetails.calendarRegion}.hubspot.com/${selectedHostDetails.calendarSlug}?embed=true`"
          class="h-[600px] w-full rounded-b-2xl border-0"
          title="Schedule a meeting"
        />
      </div>

      <!-- Invite-only message -->
      <div v-else class="px-6 py-8">
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <svg class="h-7 w-7 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div class="text-sm font-semibold text-white">
              <template v-if="selectedHost === \'shaun\'">Training sessions are invite only</template>
              <template v-else>Calendar coming soon</template>
            </div>
            <p class="mt-2 text-sm text-white/60 max-w-xs mx-auto">
              <template v-if="selectedHost === \'shaun\'">
                Shaun\'s training sessions are scheduled as part of your onboarding. You can view and join your upcoming sessions from the calendar.
              </template>
              <template v-else>
                Hope\'s calendar isn\'t available for self-booking yet. Get in touch and we\'ll arrange a time for you.
              </template>
            </p>
          </div>
          <button
            type="button"
            class="mt-2 rounded-lg bg-[#e7007e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c9006d] transition-colors"
            @click="closeNewMeeting"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </div>

'''

new_lines = lines[:start] + [new_modal] + lines[end:]
with open(filepath, 'w') as f:
    f.writelines(new_lines)

print('Done. Total lines:', len(new_lines))
