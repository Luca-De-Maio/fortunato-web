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
- El `Wallet Brick` usa `PUBLIC_MERCADOPAGO_PUBLIC_KEY`, mientras `MERCADOPAGO_ACCESS_TOKEN` queda solo en backend.
- Se crean reservas cortas de stock al generar la `preference`.
- Para confirmación server-to-server, configurá el webhook de Mercado Pago en `/api/mercadopago/webhook` y cargá `MERCADOPAGO_WEBHOOK_SECRET`.
- Las imágenes y el stock inicial todavía necesitan curado/carga final desde operación.

## Railway Prod
- Variables mínimas: `PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_ENV=prod`, `PUBLIC_SITE_URL=https://www.tiendafortunato.ar`, `SESSION_SECRET`, `DB_PATH=/data/fortunato.db`.
- Opcional por ahora: `MERCADOPAGO_WEBHOOK_SECRET` cuando Mercado Pago muestre la firma del webhook en el panel.
- SKU interna para smoke test real: `/product/sku-prueba-fortunato`. Está fuera del catálogo público, pero disponible por URL directa.

Pegá esto en Railway y reemplazá solo los placeholders de Mercado Pago, admin y sesión:

```env
ADMIN_USER=REEMPLAZAR_USUARIO_ADMIN
ADMIN_PASSWORD_HASH=REEMPLAZAR_HASH_BCRYPT
ALLOW_DEV_ADMIN_FALLBACK=false
SESSION_SECRET=REEMPLAZAR_STRING_LARGO_ALEATORIO
DB_PATH=/data/fortunato.db
PUBLIC_MERCADOPAGO_PUBLIC_KEY=REEMPLAZAR_PUBLIC_KEY_PROD
MERCADOPAGO_ACCESS_TOKEN=REEMPLAZAR_ACCESS_TOKEN_PROD
MERCADOPAGO_ENV=prod
MERCADOPAGO_WEBHOOK_SECRET=
PUBLIC_MERCADOPAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/tiendafortunato
PUBLIC_MERCADOPAGO_ALIAS=
PUBLIC_SITE_URL=https://www.tiendafortunato.ar
```

Notas rápidas:
- Si todavía no rotaste las credenciales de producción, hacelo antes de cargarlas en Railway.
- Si Railway no tiene volume montado, agregá uno para que `DB_PATH=/data/fortunato.db` no se pierda en cada deploy.
- La prueba real de punta a punta la podés hacer con `https://www.tiendafortunato.ar/product/sku-prueba-fortunato`.

## License
All rights reserved.
