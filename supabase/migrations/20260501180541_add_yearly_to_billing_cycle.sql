-- Add YEARLY to billing_cycle enum to support yearly contracts
ALTER TYPE billing_cycle ADD VALUE IF NOT EXISTS 'YEARLY';
