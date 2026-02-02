export type TicketStatus = 'Open' | 'Pending' | 'Closed'

export type TicketDto = {
  id: string
  subject: string
  status: TicketStatus
  lastUpdatedLabel: string
}

export type TicketMessageDto = {
  id: string
  direction: 'customer' | 'support'
  body: string
  timeLabel: string
}

export type TicketDetailDto = TicketDto & {
  category?: string
  priority?: 'Low' | 'Normal' | 'High'
  messages: TicketMessageDto[]
}

type TicketRecord = TicketDetailDto

const demoTickets: TicketRecord[] = [
  {
    id: 'T-1021',
    subject: 'Cannot access invoices',
    status: 'Open',
    lastUpdatedLabel: 'Today',
    category: 'Billing',
    priority: 'Normal',
    messages: [
      { id: 'm1', direction: 'customer', body: 'When I open Invoices I get an error. Can you help?', timeLabel: 'Today' },
      { id: 'm2', direction: 'support', body: 'Thanks — can you confirm which browser you are using?', timeLabel: 'Today' },
    ],
  },
  {
    id: 'T-1012',
    subject: 'Event link missing',
    status: 'Pending',
    lastUpdatedLabel: '2 days ago',
    category: 'Events',
    priority: 'Low',
    messages: [
      { id: 'm1', direction: 'customer', body: 'I registered for the webinar but can\'t see the join link.', timeLabel: '2 days ago' },
      { id: 'm2', direction: 'support', body: 'We\'re checking this now and will update you shortly.', timeLabel: '2 days ago' },
    ],
  },
  {
    id: 'T-1004',
    subject: 'Reset password',
    status: 'Closed',
    lastUpdatedLabel: 'Last week',
    category: 'Access',
    priority: 'Normal',
    messages: [
      { id: 'm1', direction: 'customer', body: 'I\'m locked out and need to reset my password.', timeLabel: 'Last week' },
      { id: 'm2', direction: 'support', body: 'Reset email sent — please try again and let us know if it persists.', timeLabel: 'Last week' },
    ],
  },
]

function generateTicketId() {
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `T-${rand}`
}

function generateMessageId() {
  return `m_${Math.floor(100000 + Math.random() * 900000)}`
}

export function listTicketsStore(): TicketDto[] {
  return demoTickets.map(({ messages: _m, category: _c, priority: _p, ...listItem }) => listItem)
}

export function getTicketStore(ticketId: string): TicketDetailDto | null {
  return demoTickets.find((t) => t.id === ticketId) ?? null
}

export function createTicketStore(params: {
  subject: string
  description: string
  category?: string
  priority?: 'Low' | 'Normal' | 'High'
}): TicketDto {
  const ticket: TicketRecord = {
    id: generateTicketId(),
    subject: params.subject,
    status: 'Open',
    lastUpdatedLabel: 'Just now',
    category: params.category,
    priority: params.priority ?? 'Normal',
    messages: [
      {
        id: generateMessageId(),
        direction: 'customer',
        body: params.description,
        timeLabel: 'Just now',
      },
    ],
  }

  demoTickets.unshift(ticket)
  return (({ messages: _m, category: _c, priority: _p, ...listItem }) => listItem)(ticket)
}

export function replyToTicketStore(ticketId: string, message: string): TicketDetailDto | null {
  const ticket = getTicketStore(ticketId)
  if (!ticket) return null

  ticket.messages.push({
    id: generateMessageId(),
    direction: 'customer',
    body: message,
    timeLabel: 'Just now',
  })
  ticket.lastUpdatedLabel = 'Just now'
  if (ticket.status === 'Closed') ticket.status = 'Open'

  return ticket
}

export function getTicketMetricsStore() {
  const metrics = {
    total: demoTickets.length,
    open: demoTickets.filter((t) => t.status === 'Open').length,
    pending: demoTickets.filter((t) => t.status === 'Pending').length,
    closed: demoTickets.filter((t) => t.status === 'Closed').length,
  }

  return metrics
}
