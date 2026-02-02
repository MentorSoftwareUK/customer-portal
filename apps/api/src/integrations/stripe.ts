import Stripe from 'stripe'
import { env } from '../env'

export function requireStripeSecretKey() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }
  return env.STRIPE_SECRET_KEY
}

export function getStripeClient() {
  const key = requireStripeSecretKey()
  return new Stripe(key, {
    apiVersion: '2024-04-10',
    typescript: true,
  })
}

export async function createCheckoutSession(params: {
  amountGbp: number
  eventTitle: string
  uiMode: 'hosted' | 'embedded'
  successUrl: string
  cancelUrl: string
  returnUrl: string
  customerEmail?: string
  clientReferenceId?: string
  metadata?: Record<string, string>
}) {
  const stripe = getStripeClient()

  if (params.uiMode === 'embedded') {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      return_url: params.returnUrl,
      customer_email: params.customerEmail,
      client_reference_id: params.clientReferenceId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: Math.round(params.amountGbp * 100),
            product_data: {
              name: params.eventTitle,
            },
          },
        },
      ],
      metadata: params.metadata,
    })

    const clientSecret = (session as any).client_secret as string | undefined
    if (!clientSecret) {
      throw new Error('Stripe session did not return a client secret for embedded checkout')
    }

    return { id: session.id, clientSecret }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.customerEmail,
    client_reference_id: params.clientReferenceId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(params.amountGbp * 100),
          product_data: {
            name: params.eventTitle,
          },
        },
      },
    ],
    metadata: params.metadata,
  })

  if (!session.url) {
    throw new Error('Stripe session did not return a checkout URL')
  }

  return { id: session.id, url: session.url }
}
