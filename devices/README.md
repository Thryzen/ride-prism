# Device catalogs

`products.json` maps **manufacturer ID + product ID** to a display name. Product IDs are manufacturer-specific; never match a product ID on its own.

`manufacturers.json` provides manufacturer names using `id` and `name`. `products.json` currently includes Garmin model mappings, with `manufacturer`, `product` and `name` in each entry. Other brands can still display names supplied by the FIT file.

Model names follow the available device definitions, preserving family and regional distinctions where applicable.

## Updating the catalog

Update manufacturer names or model mappings in the corresponding catalog. Confirm numeric IDs before adding entries. Do not submit personal FIT recordings or serial numbers.

From the project root, run:

```
python devices/build-products.py
```

Commit the catalogs and updated `device-info.js`. The generator rejects duplicate IDs, duplicate pairs and invalid IDs. The browser uses the embedded tables without network requests or Python.

Display priority: FIT-provided product name → catalog match → device description → product ID. Raw product IDs remain visible in device details. Unknown models remain usable; their activity data can still be parsed.
