# Pricing Strategy (Stage 1 Closed + Stage 2 Foundation)

## Objective
Define a coherent pricing structure aligned with the current Ohnix product, with clear differentiation and no unsupported promises.

## Scope
This strategy now includes pricing positioning, UX behavior in landing CTAs, and backend enforcement foundations for subscription entitlements.

## Plan Model

### Starter ($0/month)
Best for teams organizing core operations.

Included value:
- Core flow: products, purchases, orders, and PDF invoices.
- Baseline reporting and low-stock alerts.
- Business-hours email support.
- Self-serve implementation.

### Growth ($29/month)
Best for higher-throughput operations that need more guidance.

Included value:
- Everything in Starter.
- Advanced operational analysis and trend follow-up.
- Priority support.
- Adoption sessions and periodic operations review.

### Enterprise (Custom)
Best for multi-team operations or special requirements.

Included value:
- Dedicated onboarding and rollout plan.
- Assisted technical implementation.
- Cross-team workflow and permissions design.
- Custom integrations and requirements.

## Differentiation Rules
- Starter vs Growth: same core product capabilities, different operating support intensity and decision support depth.
- Growth vs Enterprise: service model and implementation complexity (custom rollout, integrations, service commitments).
- No plan claims features that are absent in code today.

## UX Rules Implemented
- Starter CTA: user goes to signup.
- Growth CTA: user goes to demo.
- Enterprise CTA: user is guided to contact section.

## Backend Enforcement Implemented
- Subscription model is now part of the backend data model.
- New users are provisioned with an active Starter subscription by default.
- Plan limits are enforced on core create flows:
	- products, customers, suppliers, categories, units
	- orders and purchases
- Monthly caps are enforced for orders and purchases on non-admin users.
- Subscription lifecycle endpoints are implemented (pause, cancel, reactivate, admin plan updates).
- Usage endpoints are implemented for users and admins.
- In-app upgrade request workflow is implemented (user request, user history, admin review endpoints).

## Claims Removed or Corrected
- Removed references to unsupported concepts such as workspace limits.
- Removed references to unsupported forecasting module.
- Replaced "unlimited" claims with coherent value hierarchy.

## Validation Checklist (Pass Criteria)
- Each plan has clear, non-overlapping value.
- Each claim is either product-backed today or explicitly service-backed.
- Plan progression is understandable in under 10 seconds on the landing page.
- CTA behavior matches buyer intent by plan.

## Next Stage
- Add billing integration and checkout-driven plan updates.
- Extend limit enforcement to bulk-upload projected insert counts.
- Add admin UI for reviewing and resolving upgrade requests.
