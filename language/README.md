# Translation guide

This directory contains translation sources and the generation script. The website uses the generated `i18n.js` in the project root; Python is only needed when updating translations, and no online translation service is used.

## Updating translations

- `i18n-en.json`: English translations, with Chinese source text as keys.
- `i18n-catalog.json`: A catalog of Chinese source strings to translate.
- `build-i18n.py`: Checks for missing translations and embeds the English dictionary into the browser script.

After editing translations, run this command from the project root:

```
python language/build-i18n.py
```

Commit both the translation sources and the updated `i18n.js`. Preserve meaningful spaces, units, and punctuation in template fragments. User-entered titles, signatures, and filenames should remain unchanged when switching languages.

## Adding a language

Contributions for additional languages are welcome. Use the English dictionary as a reference and create `i18n-<language-code>.json`, keeping the same Chinese source strings as keys.

The runtime currently supports Chinese and English only. Adding a dictionary alone does not enable a new language. You will also need to:

- Extend the generation script to embed the new dictionary.
- Update language registration, reverse translation mappings, and locale formatting in `i18n.js`.
- Add the language to the selectors on both the activity and share-image pages.

Check interface text, chart tooltips, and generated share-image labels. Confirm that switching languages preserves user-entered content.
