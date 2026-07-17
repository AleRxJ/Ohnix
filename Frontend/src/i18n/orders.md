Orders translation checklist
- Translate: list headers, table actions, empty states, loading texts
- Translate: order detail labels, statuses (pending, completed, cancelled)
- Translate: modal/form labels and validation messages
- Translate: toasts and confirmation texts (approve, cancel, ship)
- Add keys under `customers` pattern: `orders.*` in locale files

Procedure:
1. Read frontend order-related files.
2. Patch UI files to use `useI18n()` and `t("orders.xxx")` keys.
3. Add keys to `src/locales/en/common.json` and `src/locales/es/common.json`.
4. Run quick error check.
