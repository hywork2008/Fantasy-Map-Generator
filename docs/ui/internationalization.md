# Internationalization

The application UI uses `i18next` with `react-i18next`. English (`en`) is the source and fallback language; Japanese (`ja`) is the first supported translation.

## Use in React

Keep each user-facing sentence in `src/i18n/locales/en.json` and add the equivalent key to every supported locale. Split the files into namespaces as the catalog grows. React components use `useTranslation()` and call `t("namespace.key")` for visible text, tooltip text, and accessible labels.

```tsx
const { t } = useTranslation();
return <button aria-label={t("common.close")}>{t("common.close")}</button>;
```

Use semantic keys, not English sentences as keys. Do not translate DOM IDs, layer IDs, saved-data keys, map-generation data, or user-created names.

## Language state

`src/store/localeState.ts` owns the selected application language and persists it under `localStorage["fmg-language"]`. The selector is currently in the UI settings tab. Changing it also updates `document.documentElement.lang` and the initialized i18next instance.

For non-React code, import the initialized instance from `src/i18n` and use `i18n.t(...)`; do not access React hooks outside a component. Format dates, numbers, and units with the active locale through `Intl`, instead of concatenating translated fragments.

## Extension boundary

Built-in and dynamic extensions must not assume host locale files are importable. A future extension-facing translation API should be added to `ExtensionAPI` before extension UI is localized. Until then, extensions keep their own locale resources and avoid importing host i18n implementation details.

## Tests

Add a test whenever a locale, language-selection behavior, interpolation, or plural rule changes. Tests should verify both the rendered label and the persisted language preference.
