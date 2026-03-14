---
name: SA_GreenGlow
description: Principles for designing high-efficiency, field-first CRMs based on the Zendesk Benchmark.
---

# SA_GreenGlow - Zendesk CRM Design Standards

This skill ensures that all features designed for the Green Flow CRM prioritize User Adoption, Operational Efficiency, and Field-First UX.

## 1. Core UX & Utilization Principles (The Zendesk Benchmark)
- **"Get In and Get Working"**: Interfaces must be intuitive. Providers should handle daily visits immediately upon login without training.
- **Context-Aware Actions**: Use conditional rendering for "Quick Actions."
    - *Example*: If inspection is **DRAFT**, show "Generate Offer"; if offer is **SENT**, show "Mark as Accepted".
- **The Help Center Hierarchy**: Design the Client Portal (`/client`) as a "Self-Service First" platform. Focus on transparency of history, invoices, and schedules to reduce support tickets.
- **Responsive Field Operations**: 
    - **Provider Interface**: Optimized for mobile "Field Reps" (large buttons, offline-ready logic, voice-to-text).
    - **Admin Dashboard**: Data-dense tables and analytics for desktop.

## 2. Technical Architecture & Security
- **Multi-Tenancy (Data Isolation)**: Every query and RLS policy must be scoped to `tenant_id`. Zero risk of data bleeding between landscape companies.
- **Role-Based Access Control (RBAC)**:
    - **PROVIDER_ADMIN**: Full access to billing, team management, and analytics.
    - **PROVIDER_STAFF**: Access to assigned visits, property details, and task completion.
    - **CLIENT_USER**: Restricted to their own properties, offers, and history.
- **State-Driven Workflow Engine**: Use finite state machines for pipeline transitions (Inspection -> Offer -> Contract). Transitions must be atomic.

## 3. Standard CRM Modules
- **Omnichannel Activity Log**: Unified timeline of emails, AI summaries, visit notes, and feedback.
- **Automated Triggers**:
    - **Post-Visit**: Trigger AI-generated summary for the client.
    - **Unsigned Offer**: Trigger reminder after 48 hours.
    - **SLA Monitoring**: Alert admins if "Pending Inspection" is > 3 days.
- **Inventory as Assets**: Treat landscapes (trees, lawns) as managed assets with a maintenance lifecycle.

## 4. Interaction Protocol
- **Before Coding**: Always ask, "What is the primary user outcome for this feature?"
- **Code Review**: Audit for Type Safety (TypeScript) and RLS Security (Supabase).
- **Technical Next Steps**: Always end with a clear technical next step.
