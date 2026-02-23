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

const tickets: TicketRecord[] = []

function generateTicketId() {
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `T-${rand}`
}

function generateMessageId() {
  return `m_${Math.floor(100000 + Math.random() * 900000)}`
}

export function listTicketsStore(): TicketDto[] {
  return tickets.map(({ messages: _m, category: _c, priority: _p, ...listItem }) => listItem)
}

export function getTicketStore(ticketId: string): TicketDetailDto | null {
  return tickets.find((t) => t.id === ticketId) ?? null
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

  tickets.unshift(ticket)
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
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'Open').length,
    pending: tickets.filter((t) => t.status === 'Pending').length,
    closed: tickets.filter((t) => t.status === 'Closed').length,
  }

  return metrics
}
