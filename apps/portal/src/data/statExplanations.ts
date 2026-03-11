/**
 * Explanation texts for each dashboard stat card & section.
 * Used by AudioTooltip to provide spoken descriptions of how each metric is calculated.
 */

/* ── Marketing tab ── */

export const marketingExplanations: Record<string, string> = {
  mqls: 'MQLs, or Marketing Qualified Leads, is the total number of non-bot form submissions received this month across all your HubSpot forms. Each unique form submission counts as one MQL.',
  sql: 'SQLs, or Sales Qualified Leads, are form submissions where the contact has progressed past the initial stage in your lead pipeline. Specifically, they have moved beyond New Lead status, indicating genuine sales interest.',
  demos: 'Demos counts completed product demonstrations. A submission counts as a demo if the contact reached the Demo Completed stage in your pipeline.',
  mqlToDemo: 'MQL to Demo rate is the percentage of all form submissions that resulted in a completed demo. It is calculated by dividing the number of demos by the total MQLs, showing your overall marketing to sales conversion efficiency.',
  funnel: 'The funnel shows the progression from all form submissions at the top, through to qualified leads, and finally completed demos. The percentages between each stage show the conversion rates.',
  formPerformance: 'Form performance breaks down each individual form, showing how many submissions it received, how many became qualified leads, and how many converted to demos. The best performing form is highlighted.',
  leadPipeline: 'Lead pipeline shows how many leads are sitting at each stage of your sales pipeline. This helps identify bottlenecks where leads may be getting stuck.',
  stageBreakdown: 'Registration Stage shows the breakdown of form submissions by the contacts current registration stage. This is pulled from HubSpot, showing how many leads are pre-registration versus already registered.',
  provisionType: 'Provision Type breaks down submissions by the type of care service the contact operates, such as Childrens Home, Supported Accommodation, or 18 Plus provision. This helps identify which market segments generate the most interest.',
  referral: 'Where Did You Hear About Us shows the acquisition channels that contacts reported when submitting forms. This self reported data helps evaluate which marketing channels are driving awareness.',
  weeklySubmissions: 'Submissions over time shows the volume of form submissions per week within the selected month. This helps identify patterns in lead generation activity and any spikes or drops.',
  trafficSources: 'Traffic sources shows where your website visitors came from, pulled from HubSpot analytics. Categories include Organic Search, Direct Traffic, Social Media, Paid Search, and Referrals.',
}

/* ── Sales tab ── */

export const salesExplanations: Record<string, string> = {
  dealsWon: 'Deals Won is the total number of deals that moved to Closed Won status this month. The today and this week counts track recent momentum.',
  revenueWon: 'Revenue Won is the total monetary value of all Closed Won deals this month, taken from the deal amount property in HubSpot.',
  winRate: 'Win Rate is the percentage of closed deals that were won. It is calculated by dividing Closed Won deals by the total of all closed deals, both won and lost, for the month.',
  avgCloseTime: 'Average Close Time is the mean number of days between a deal being created and being marked as Closed Won. Lower numbers indicate a faster sales cycle.',
  openPipeline: 'Open Pipeline is the total value of all deals currently in active stages, not yet closed won or lost. This represents potential future revenue.',
  loseRate: 'Lose Rate is the percentage of closed deals that were lost. It is calculated by dividing Closed Lost deals by the total of all closed deals for the month.',
  freeCustomers: 'Free Customers tracks contacts using the product at no cost until they become registered, showing the total number, new free customers this month, how many converted to paying, and the revenue from those conversions.',
  agentPerformance: 'Performance by agent breaks down sales activity by team member, showing each persons won deals, lost deals, revenue generated, and current open pipeline with individual win rates.',
  dealPipeline: 'Deal pipeline shows the number of deals at each stage of your sales process along with their total value, helping visualise where deals are concentrated.',
  mrrTrend: 'Monthly recurring revenue trend shows the total revenue from closed won deals over the past 6 months, helping visualise revenue growth or decline over time.',
  recentDeals: 'Recent deals shows the most recently closed deals with the agent who closed them, the deal value, whether it was won or lost, and when it was closed.',
}

/* ── Success tab ── */

export const successExplanations: Record<string, string> = {
  payingCustomers: 'Paying Customers is the count of companies in HubSpot with an active, paying subscription. This excludes free tier and churned customers.',
  retentionRate: 'Retention Rate is the percentage of customers retained overall. It is calculated as paying customers divided by total paying plus churned, showing the health of your customer base.',
  churned: 'Churned shows the number of customers who cancelled their subscription. The monthly and 3 month breakdowns help identify trends in customer loss.',
  offboarding: 'Off-boarding shows customers who are currently going through the cancellation process but have not fully left yet.',
  avgTenure: 'Average Tenure is calculated by looking at each paying customers close date and measuring how many months they have been active. This is then averaged across all paying customers.',
  meetings: 'Meetings shows the total number of meetings logged in HubSpot in the last 30 days by the Success team.',
  completed: 'Completed meetings are meetings that actually took place with the customer, as opposed to meetings where the customer did not attend.',
  noShow: 'No shows counts the number of meetings where the customer failed to attend. A high no show rate may indicate engagement problems.',
  successTeam: 'Success Team shows each team members meeting activity including total meetings, completed, and no shows, along with how many companies they are assigned to and their completion rate.',
  atRisk: 'At risk customers are identified using a weighted scoring system. Points are added for no recent contact, no meetings in 60 or 90 days, low total engagement, and being a new customer with no onboarding meeting. Scores of 60 or above are high risk, 40 or above medium, and 25 or above low risk.',
  churnTrend: 'Churn versus new customers shows a 6 month trend of how many customers left compared to how many new customers joined each month, helping visualise whether the customer base is growing or shrinking.',
  cancellationReasons: 'Cancellation Reasons shows a breakdown of why customers left, based on the reason recorded when deals were closed as lost. This helps identify patterns in churn.',
  tenureDistribution: 'Customer Tenure groups all paying customers by how long they have been subscribed, from under 3 months through to over 2 years. This shows the maturity profile of your customer base.',
  recentChurned: 'Recently churned shows the most recent customers who have left, along with when they left and the reason recorded for their departure.',
}
