/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

/** Email categories — must match public.email_categories.key */
export type EmailCategory =
  | 'account'
  | 'visits'
  | 'contracts_offers'
  | 'inspections'

/**
 * Maps each template to a governance category. Used by send-transactional-email
 * to apply tenant kill switches and per-recipient preferences.
 */
export const TEMPLATE_CATEGORY: Record<string, EmailCategory> = {
  'test-notification':     'account',
  'connection-approved':   'account',
  'contract-sent':         'contracts_offers',
  'contract-response':     'contracts_offers',
  'offer-sent':            'contracts_offers',
  'offer-response':        'contracts_offers',
  'visit-report':          'visits',
  'inspection-scheduled':  'inspections',
}

import { template as testNotification } from './test-notification.tsx'
import { template as contractSent } from './contract-sent.tsx'
import { template as contractResponse } from './contract-response.tsx'
import { template as offerSent } from './offer-sent.tsx'
import { template as offerResponse } from './offer-response.tsx'
import { template as visitReport } from './visit-report.tsx'
import { template as inspectionScheduled } from './inspection-scheduled.tsx'
import { template as connectionApproved } from './connection-approved.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-notification': testNotification,
  'contract-sent': contractSent,
  'contract-response': contractResponse,
  'offer-sent': offerSent,
  'offer-response': offerResponse,
  'visit-report': visitReport,
  'inspection-scheduled': inspectionScheduled,
  'connection-approved': connectionApproved,
}
