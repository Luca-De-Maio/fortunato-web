# Fortunato Web

Standalone storefront for Fortunato. Built with Astro and a performance‑first, minimal UI.

## Stack
- Astro 5
- Vanilla CSS
- JSON seed + local SQLite (`sql.js`) para catálogo y reservas

## Scripts
```bash
npm install
npm run dev
npm run build
npm run preview
```

## Project Structure
```
.
├─ data/
│  └─ products.json      # Single source of truth for catalog
├─ public/
│  └─ placeholder.svg    # Placeholder image
├─ src/
│  ├─ components/
│  ├─ layouts/
│  ├─ pages/
│  └─ styles/
├─ SPEC.md               # Product/site brief
└─ DECISIONS.md          # Assumptions & placeholders
```

## Content & Catalog
`data/products.json` is the catalog source of truth.

### Add images to an existing product
1. Copy the original photos into `public/images/products/<slug>/`
2. Generate the curated `hero` and `grid` variants:

```bash
npm run image:prepare -- <slug> --pick <archivo-principal>
```

Example:

```bash
npm run image:prepare -- camisa-nuova --pick IMG_1042.JPG
```

This updates `data/products.json` with:
- `gridImage`
- ordered `images`
- de-duplicated local gallery

### Add a new product
You now have 2 valid flows:

#### Recommended: local assets + JSON
1. Create the folder `public/images/products/<slug>/`
2. Add the raw photos there
3. Add the new product object to `data/products.json`
4. Run:

```bash
npm run image:prepare -- <slug> --pick <archivo-principal>
```

The app syncs any missing product from `data/products.json` into the local DB automatically.

#### Alternative: admin panel
1. Go to `/admin/products`
2. Create the product
3. Upload images from the admin

Admin saves now also persist back into `data/products.json`, so DB and catalog file stay aligned.

## Pages
- `/` Home
- `/capsula` Catálogo completo
- `/conjunto/[slug]` Detalle de conjunto/combinación
- `/product/[slug]` Product detail
- `/cart` Cart
- `/checkout/*` Estados de retorno de Mercado Pago

## Notes
- El carrito revalida precios y stock desde backend antes de abrir Mercado Pago.
- Se crean reservas cortas de stock al generar la `preference`.
- Las imágenes y el stock inicial todavía necesitan curado/carga final desde operación.

## License
All rights reserved.
