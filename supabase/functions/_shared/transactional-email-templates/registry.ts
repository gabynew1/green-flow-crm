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
  | 'lifecycle'

/**
 * Maps each template to a governance category. Used by send-transactional-email
 * to apply tenant kill switches and per-recipient preferences.
 */
export const TEMPLATE_CATEGORY: Record<string, EmailCategory> = {
  'test-notification':     'account',
  'connection-approved':   'account',
  'password-reset':        'account',
  'contract-sent':         'contracts_offers',
  'contract-response':     'contracts_offers',
  'offer-sent':            'contracts_offers',
  'offer-response':        'contracts_offers',
  'visit-report':          'visits',
  'inspection-scheduled':  'inspections',
  'onboarding-day-0':      'lifecycle',
  'onboarding-day-2':      'lifecycle',
  'onboarding-day-7':      'lifecycle',
  'super-admin-new-signup':'account',
  'welcome-provider':      'lifecycle',
  'welcome-client':        'lifecycle',
  'lifecycle-prelock':     'lifecycle',
  'lifecycle-locked':      'lifecycle',
  'lifecycle-d30':         'lifecycle',
  'lifecycle-d90':         'lifecycle',
  'lifecycle-d150':        'lifecycle',
  'lifecycle-final5bd':    'lifecycle',
  'lifecycle-deleted':     'lifecycle',
}

import { template as testNotification } from './test-notification.tsx'
import { template as contractSent } from './contract-sent.tsx'
import { template as passwordReset } from './password-reset.tsx'
import { template as contractResponse } from './contract-response.tsx'
import { template as offerSent } from './offer-sent.tsx'
import { template as offerResponse } from './offer-response.tsx'
import { template as visitReport } from './visit-report.tsx'
import { template as inspectionScheduled } from './inspection-scheduled.tsx'
import { template as connectionApproved } from './connection-approved.tsx'
import { template as onboardingDay0 } from './onboarding-day-0.tsx'
import { template as onboardingDay2 } from './onboarding-day-2.tsx'
import { template as onboardingDay7 } from './onboarding-day-7.tsx'
import { template as superAdminNewSignup } from './super-admin-new-signup.tsx'
import { template as welcomeProvider } from './welcome-provider.tsx'
import { template as welcomeClient } from './welcome-client.tsx'
import {
  prelock as lifecyclePrelock,
  locked as lifecycleLocked,
  d30 as lifecycleD30,
  d90 as lifecycleD90,
  d150 as lifecycleD150,
  final5bd as lifecycleFinal,
  deleted as lifecycleDeleted,
} from './lifecycle-notice.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-notification': testNotification,
  'password-reset': passwordReset,
  'contract-sent': contractSent,
  'contract-response': contractResponse,
  'offer-sent': offerSent,
  'offer-response': offerResponse,
  'visit-report': visitReport,
  'inspection-scheduled': inspectionScheduled,
  'connection-approved': connectionApproved,
  'onboarding-day-0': onboardingDay0,
  'onboarding-day-2': onboardingDay2,
  'onboarding-day-7': onboardingDay7,
  'super-admin-new-signup': superAdminNewSignup,
  'welcome-provider': welcomeProvider,
  'welcome-client': welcomeClient,
  'lifecycle-prelock': lifecyclePrelock,
  'lifecycle-locked': lifecycleLocked,
  'lifecycle-d30': lifecycleD30,
  'lifecycle-d90': lifecycleD90,
  'lifecycle-d150': lifecycleD150,
  'lifecycle-final5bd': lifecycleFinal,
  'lifecycle-deleted': lifecycleDeleted,
}
